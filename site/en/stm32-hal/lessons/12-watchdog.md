# 12 · 看门狗：IWDG 与 WWDG

part: 第四篇 · 定时器与看门狗
video: P76 – P85
level: 基础
lead: 看门狗是产品的「最后一道保险」：程序跑飞、死循环、中断卡死时，没人喂狗，硬件就复位。F1 有两个看门狗——独立看门狗 IWDG 用内部 LSI，主时钟坏了也能工作；窗口看门狗 WWDG 用 APB1 时钟，还能限定「只能在窗口内喂」，专门抓「程序跑太快」。

goals:
- 能算出 IWDG 的溢出时间，并按需求选预分频与重装载值
- 能说清 IWDG 与 WWDG 的时钟源、喂狗窗口与适用场景
- 能用 CubeMX + HAL 配出两个看门狗，并在主循环正确喂狗
- 知道什么代码不能放在喂狗与业务之间，避免「假喂狗」

stats: 2 个看门狗 · 1 条溢出公式 · 1 个窗口概念

## 一、IWDG：独立看门狗

### 原理

IWDG 的时钟来自 **LSI（约 40kHz）**，与主时钟、APB 无关。它有一个 12 位递减计数器，减到 0 就产生复位；你在它到 0 之前写 `0xAAAA` 重装载，就是「喂狗」。

```
LSI 40kHz ─► 预分频（4/8/16/32/64/128/256）─► 12 位递减计数器 ─► 到 0 复位
                                              ▲
                                    喂狗：写 RLR 重装载
```

溢出时间：

```
T = (4 × 2^PR) × (RLR + 1) / 40000    （秒）
```

| PR | 预分频 | RLR | 溢出时间 |
|---|---|---|---|
| 0 | 4 | 625 | 62.5ms |
| 2 | 16 | 625 | 250ms |
| 3 | 32 | 625 | 500ms |
| 4 | 64 | 625 | 1s |
| 4 | 64 | 1250 | 2s |
| 5 | 128 | 1250 | 4s |

> LSI 的典型值是 40kHz，但实际在 30–60kHz 间波动，所以 IWDG 的超时是「大约」。要精确计时用 WWDG 或普通定时器；IWDG 只负责「卡死就复位」，别拿它当秒表。

### HAL 配置

```c
IWDG_HandleTypeDef hiwdg;

hiwdg.Instance       = IWDG;
hiwdg.Init.Prescaler = IWDG_PRESCALER_64;   /* 64 分频 */
hiwdg.Init.Reload    = 1250;                /* 约 2s */
if (HAL_IWDG_Init(&hiwdg) != HAL_OK) {
    Error_Handler();
}

/* 主循环：确认关键任务都跑到了，再喂 */
HAL_IWDG_Refresh(&hiwdg);
```

**`HAL_IWDG_Init()` 一调用，看门狗立刻开始计数**，没有「先关后开」的窗口；初始化后必须尽快进入喂狗循环。

### 正确喂狗的位置

```c
while (1)
{
    Task_Sensor();       /* 采集 */
    Task_Comm();         /* 通信 */
    Task_Display();      /* 显示 */

    /* 只有前面都跑完，才喂狗 */
    HAL_IWDG_Refresh(&hiwdg);
    HAL_Delay(10);
}
```

不要放在定时器中断里无条件喂——那样主循环卡死，中断还在喂，看门狗形同虚设。也不要放在 `HAL_Delay` 之前，否则延时卡住时狗已经喂过了。

## 二、WWDG：窗口看门狗

### 与 IWDG 的区别

| 项目 | IWDG | WWDG |
|---|---|---|
| 时钟源 | LSI ~40kHz（独立） | PCLK1（36MHz，依赖主时钟） |
| 计数器 | 12 位递减 | 7 位递减（0x7F→0x40） |
| 喂狗限制 | 任意时刻，到 0 前 | **只能在窗口内**（不能太早，也不能太晚） |
| 复位条件 | 减到 0 | 减到 0x3F（小于 0x40）或喂太早 |
| 适用 | 防死机 | 防「程序跑飞后跑得太快」 |

WWDG 的计数器是 7 位，减到 `0x40` 时如果还没喂，就会复位；同时有一个「窗口值」W，计数器高于 W 时喂狗也会复位。所以喂狗必须落在 `[0x40, W]` 这个窗口里。

```
0x7F ────────► W ────────► 0x40 ──► 0x3F 复位
     不能喂        可喂        必须已喂
```

### 超时与窗口计算

WWDG 的超时（从 0x7F 减到 0x40）：

```
T = 4096 × 2^WDGTB × (0x3F + 1) / PCLK1
```

PCLK1=36MHz、WDGTB=3（÷8）时：T = 4096×8×64/36e6 ≈ 58.3ms。窗口值 W 决定最早能喂的时刻：W 越接近 0x7F，窗口越窄。

### HAL 配置

```c
WWDG_HandleTypeDef hwwdg;

hwwdg.Instance       = WWDG;
hwwdg.Init.Prescaler = WWDG_PRESCALER_8;
hwwdg.Init.Window    = 0x50;     /* 窗口值：计数器 > 0x50 时喂会复位 */
hwwdg.Init.Counter   = 0x7F;
hwwdg.Init.EWMode    = WWDG_EWI_DISABLE;

if (HAL_WWDG_Init(&hwwdg) != HAL_OK) Error_Handler();

/* 主循环在窗口内喂 */
HAL_WWDG_Refresh(&hwwdg);
```

`HAL_WWDG_Init()` 也会立刻启动。喂太早会复位，所以主循环的周期必须落在窗口内；周期波动大的系统不要用 WWDG。

## 三、CubeMX 怎么配

### IWDG

**System Core → IWDG**：勾 `Activated`，Prescaler 选 64，Down-counter 填 1250，Window 默认。生成后 `MX_IWDG_Init()` 会在 `main()` 里调用，初始化即启动。

### WWDG

**System Core → WWDG**：勾 `Activated`，Prescaler 8，Window 0x50，Counter 0x7F。需要早期唤醒中断就勾 EWI 并在 NVIC 里使能。

> 调试时看门狗会不停复位，打断断点。Keil 的 Debug → Settings → 勾 `Stop watchdogs`（部分调试器支持），或在调试版里用宏关掉 `HAL_IWDG_Init`。发布版务必打开。

## 四、实战：验证看门狗复位

```c
/* 正常喂狗 2 秒，然后故意停 3 秒 */
HAL_IWDG_Refresh(&hiwdg);
HAL_Delay(2000);

/* 模拟卡死：不再喂狗 */
while (1) {
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
    HAL_Delay(100);          /* 约 2s 后芯片复位，LED 重新开始 */
}
```

现象：LED 闪几下后突然从头开始（复位），串口如果打印启动信息会看到重新输出。用 `__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)` 可以判断上次复位原因：

```c
if (__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) {
    printf("reset by IWDG\r\n");
    __HAL_RCC_CLEAR_RESET_FLAGS();
}
```

## 五、坑：看门狗反而让系统不稳定

| 现象 | 原因 | 修法 |
|---|---|---|
| 上电几秒就复位 | 初始化后没及时喂 / 超时太短 | 先喂一次，超时留 2 倍余量 |
| 调试时不停复位 | 断点停住，狗还在跑 | 调试版关狗或 Stop watchdogs |
| 主循环卡死但不复位 | 在中断里喂狗 | 喂狗只放主循环末尾 |
| WWDG 一喂就复位 | 喂太早（计数器 > Window） | 调整 Window 或循环周期 |
| 低功耗待机被狗咬 | 待机前没处理 IWDG | 待机前无法停 IWDG，改用 WWDG 或复位唤醒 |
| 复位原因判断错 | 没清复位标志 | 启动时读并清 `RCC_FLAG_*RST` |

## 练习

Q| IWDG 的 LSI 是 40kHz，预分频 64、重装载 1250，溢出时间是多少？如果 LSI 实际是 30kHz，实际时间变成多少？
A| 标称：T = 64 × 1251 / 40000 ≈ 2.0s。若 LSI 降到 30kHz：T = 64 × 1251 / 30000 ≈ 2.67s。也就是说 LSI 偏慢时超时变长，偏快时变短；设计上要按最坏情况留余量，别把喂狗周期卡在超时边缘。

Q| 为什么说「在定时器中断里喂狗」等于没开看门狗？正确的喂狗条件是什么？
A| 因为看门狗要检测的是「主循环/关键任务是否还活着」。定时器中断由硬件独立触发，即使主循环卡死（死循环、阻塞、HardFault 前的假活），中断仍会按时喂狗，硬件永远不复位。正确做法：主循环跑完所有关键任务后喂一次；或用「任务打卡」机制，只有所有任务都置了标志才喂。

Q| WWDG 的「窗口」到底限制了什么？如果一个任务的周期在 10–100ms 之间波动，适合用 WWDG 吗？
A| 窗口限制了「最早能喂的时刻」：计数器高于 Window 值时喂狗会立即复位，低于 0x40 也会复位，只有落在窗口内才合法。它抓的是「程序跑太快/跳过某段代码」。周期在 10–100ms 大幅波动的任务不适合 WWDG：周期短于窗口下沿会喂太早复位，长于超时会喂太晚复位；这种系统用 IWDG 更稳。

Q| 产品从调试版切到发布版，看门狗相关要做哪些检查？
A| ① 确认 `HAL_IWDG_Init()` 在发布版一定被调用（不要被调试宏关掉）；② 喂狗点覆盖所有关键任务，且不会被长时间阻塞（Flash 擦写、长延时、网络等待）；③ 超时留足余量（至少 2 倍最坏循环时间）；④ 启动时读取并清除复位标志，记录复位原因；⑤ 低功耗模式与看门狗的关系确认（待机时 IWDG 仍在跑，唤醒方式要设计好）；⑥ 用长时间老化测试验证不会误复位。