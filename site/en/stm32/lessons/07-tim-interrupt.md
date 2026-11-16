# 07 · TIM 定时中断：给系统装一个心跳
part: 第三篇 · 中断与定时器
video: P13 – P14 · TIM 定时中断 / 定时器定时中断、定时器外部时钟
level: 进阶
lead: 定时器是一个「会自己数数的硬件」：时钟每来一个脉冲，计数寄存器加一；加到你设定的数，就归零、并且举手告诉你「时间到了」。从此你的程序有了不依赖 `Delay` 的时间基准。
goals:
- 能用 PSC / ARR / 时钟频率三个数算出任意定时时间，反过来也能由时间和频率定 PSC 与 ARR
- 能配出一路 1ms 中断，并在中断里做 1 秒闪灯、计时器
- 能说清「内部时钟」与「外部时钟模式」的区别，会用 ETR 引脚数外部脉冲
- 知道定时器中断里该做什么、不该做什么
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、时基单元：三个寄存器说清一切

| 寄存器 | 作用 | 范围 | 类比 |
| --- | --- | --- | --- |
| `PSC` 预分频器 | 把输入时钟「减速」 | 0–65535（实际分频 = PSC+1） | 秒针走一圈，分针才走一格 |
| `CNT` 计数器 | 当前数到几 | 0–65535（向上/向下/中央对齐） | 数数的人 |
| `ARR` 自动重装 | 数到这个值就归零并产生事件 | 0–65535 | 「数到 1000 就重新开始」 |

整条链路是：**定时器时钟（fCK）→ ÷(PSC+1) → CNT 每来一个脉冲加一 → CNT 追上 ARR → 归零 + 产生更新事件（UEV）→ 若开了中断，就进中断函数**。

定时频率和定时时间的公式只有一条，务必背下来：

**f_update = fCK / ((PSC + 1) × (ARR + 1))　　　T = 1 / f_update**

TIM2/3/4 挂在 APB1 上，APB1 = 36MHz，但定时器时钟自动 ×2，所以 **fCK = 72MHz**（第 01 课讲过这条例外规则）。

## 二、算例：从「我要 1ms」到两个数字

| 目标 | 取 PSC | 得 CNT 计数频率 | 取 ARR | 实际周期 | 误差 |
| --- | --- | --- | --- | --- | --- |
| 1ms | 71（÷72） | 1MHz（1μs 一次） | 999 | 1000 × 1μs = 1ms | 0 |
| 1ms（错误算例） | 7199（÷7200） | 10kHz（100μs 一次） | 99 | 100 × 100μs = 10ms ❌ | 大了 10 倍 |
| 10ms | 7199 | 10kHz | 99 | 100 × 100μs = 10ms | 0 |
| 1s | 7199 | 10kHz | 9999 | 10000 × 100μs = 1s ✓ | 0（ARR 已接近上限） |

第三行是故意写错的：**PSC 和 ARR 要一起算**，只盯着一个数必然算错。养成习惯：先在纸上写 `72,000,000 / (PSC+1) / (ARR+1) = 目标频率`，代进去验算一遍再写代码。

:::tip 为什么常用「PSC=71, ARR=999」
因为它把计数器变成「1μs 一跳」，ARR=999 就是 1ms，改 ARR 就能直接读成「多少毫秒」。调试时把 ARR 当参数改，比每次重算 PSC 方便得多。
代价是 PSC 分频比小（÷72），计数器跑得快，长时间定时（比如 1 小时）需要软件累加。
:::

## 三、1ms 心跳：代码

```c
#include "stm32f10x.h"

uint16_t ms_Tick = 0;        // 软件毫秒计数
uint8_t  sec = 0, min = 0;

void Timer_Init(void)
{
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);   // TIM2 在 APB1 上

    /* ① 时基：72MHz / 72 = 1MHz，数 1000 次 = 1ms */
    TIM_TimeBaseStructure.TIM_Prescaler         = 72 - 1;      // PSC = 71
    TIM_TimeBaseStructure.TIM_Period            = 1000 - 1;    // ARR = 999
    TIM_TimeBaseStructure.TIM_ClockDivision     = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode       = TIM_CounterMode_Up;
    TIM_TimeBaseStructure.TIM_RepetitionCounter = 0;           // 高级定时器才用
    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseStructure);

    /* ② 清一下更新标志，避免一开中断就立刻进一次 */
    TIM_ClearFlag(TIM2, TIM_FLAG_Update);

    /* ③ 开 TIM2 的更新中断 */
    TIM_ITConfig(TIM2, TIM_IT_Update, ENABLE);

    /* ④ NVIC */
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = TIM2_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);

    /* ⑤ 启动定时器 */
    TIM_Cmd(TIM2, ENABLE);
}

void TIM2_IRQHandler(void)
{
    if(TIM_GetITStatus(TIM2, TIM_IT_Update) == SET){
        ms_Tick++;
        if(ms_Tick >= 1000){              // 1 秒
            ms_Tick = 0;
            sec++;
            if(sec >= 60){ sec = 0; min++; }
        }
        TIM_ClearITPendingBit(TIM2, TIM_IT_Update);
    }
}
```

第 ② 步的 `TIM_ClearFlag` 不是可选的。初始化时写 `ARR` 会立刻产生一次「更新事件」，标志位被置起；这时如果先开了中断使能再启动，程序会**一上电就多进一次中断**。表现为：秒表刚上电就显示 1 秒，或者计数器初始值总是多 1。

有了这个 1ms 心跳，前面第 04 课的按键消抖就可以改成非阻塞的：

```c
/* 每 1ms 调一次，连续 20 次读到相同状态才认 */
void Key_Scan_1ms(void)
{
    static uint8_t cnt = 0, stable = 1;
    uint8_t raw = GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1);

    if(raw != stable){
        if(++cnt >= 20){ stable = raw; cnt = 0; /* 这里产生一次按键事件 */ }
    }else{
        cnt = 0;
    }
}
```

## 四、外部时钟模式：数外面的脉冲

内部时钟是「数自己心跳」，外部时钟是「数别人给的脉冲」。三种常见来源：

| 模式 | 时钟从哪来 | 配置要点 | 用途 |
| --- | --- | --- | --- |
| 内部时钟 | RCC 给的 72MHz | 默认 | 定时、PWM |
| 外部时钟模式 1 | 引脚 ETR（TIM2_ETR = PA0） | `TIM_ETRClockMode2Config` | 数外部脉冲个数 |
| 外部时钟模式 2 | 通道 TI1/TI2 的边沿 | `TIM_ITRxExternalClockConfig` | 级联、编码器 |
| 内部触发（ITR） | 另一个定时器的输出 | `TIM_SelectInputTrigger` | 多定时器同步 |

数外部脉冲的写法（以 TIM2 的 ETR = PA0 为例）：

```c
void Timer_ETR_Init(void)
{
    /* PA0 必须配成浮空输入，外部信号直接进定时器 */
    GPIO_InitTypeDef GPIO_InitStructure;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_0;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    TIM_TimeBaseStructure.TIM_Prescaler     = 1 - 1;      // 不分频：每个脉冲计 1
    TIM_TimeBaseStructure.TIM_Period        = 65536 - 1;  // 计满 65536 溢出
    TIM_TimeBaseStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode   = TIM_CounterMode_Up;
    TIM_TimeBaseStructure.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseStructure);

    /* 外部时钟模式 2：ETR 上升沿驱动 CNT */
    TIM_ETRClockMode2Config(TIM2, TIM_ExtTRGPSC_OFF, TIM_ExtTRGPolarity_NonInverted, 0x0F);
    TIM_SetCounter(TIM2, 0);
    TIM_Cmd(TIM2, ENABLE);
}
```

此时读 `TIM_GetCounter(TIM2)` 就是「从清零到现在来了多少个脉冲」。这就是最朴素的**频率计**：固定 1 秒读一次，读数就是 Hz。第 09 课的输入捕获是它的升级版——不用等 1 秒，直接测一个周期有多长。

## 五、坑：定时器最常错的三处

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 定时时间差 2 倍 | 把 APB1 的 36MHz 当成了定时器时钟 | 定时器时钟 ×2 = 72MHz，用 72M 算 |
| 差 1 倍或 10 倍 | `PSC` / `ARR` 写成了分频值而不是「值−1」 | 库里填的是寄存器值，分频 N 要填 N−1 |
| 定时器完全不工作 | 忘了 `TIM_Cmd(TIMx, ENABLE)` | 初始化最后一定要启动 |
| 一上电就多进一次中断 | 没清更新标志 | `TIM_ClearFlag(TIMx, TIM_FLAG_Update)` |
| 改了 ARR 但周期没变 | 预装载（ARPE）没有生效 | 用 `TIM_TimeBaseInit` 会开 ARPE，运行时改 ARR 要等下一个周期 |

:::warn ARR 与 PSC 都是 16 位
两者最大都是 65535。所以「72MHz 直接数到 1 秒」是不可能完成的：72,000,000 远超 65535，必须先分频。
组合的上限是 65536×65536 ≈ 42.9 亿个时钟周期 ≈ 59.6 秒 @72MHz。要更长的时间，只能在中断里做软件累加（本课的 `min`/`sec` 就是这么来的）。
:::

## 六、有了心跳之后能做什么

| 需求 | 做法 |
| --- | --- |
| 1 秒闪一次 LED | 1ms 中断里计数到 1000 翻转 IO |
| 数码秒表 / 时钟 | 1ms → 秒 → 分 → 时，逐级进位（注意 60 进制） |
| 非阻塞按键消抖 | 1ms 采样一次，连续 20 次稳定才认（见上文） |
| 定周期采样 ADC | 1ms 中断里置标志，主循环读一次 ADC |
| 软件 PWM（引脚不够用时） | 1ms 中断里比较计数值与占空比，翻转 IO |

注意最后一条的代价：软件 PWM 精度只有 1ms 一档，频率最高 500Hz 左右，还会有抖动。能用硬件 PWM（第 08 课）就不要用软件模拟。

## 练习
Q| 要求每 500ms 进一次中断，TIM3 的 fCK = 72MHz。给出两组 (PSC, ARR) 并验算。
A| 取 PSC = 7199（÷7200 → 10kHz，每跳 100μs），ARR = 4999：周期 = 5000 × 100μs = 500ms ✓
A| 另一组：PSC = 71（÷72 → 1MHz，每跳 1μs），ARR = 499999 —— 超过 65535，不合法。所以必须用大分频，「小 PSC + 大 ARR」在小定时时间才可行。
Q| 初始化里漏了 `TIM_ClearFlag(TIM2, TIM_FLAG_Update)`，程序会有什么现象？
A| 上电后第一次进中断的时间不确定：因为写 `ARR` 时已经产生过一次更新事件、标志已置位，中断使能一开就立刻进一次，相当于「多计了一个周期」。
A| 表现是秒表起跑就慢 1ms、或者计数器初始值比预期大 1。修法是在 `TIM_ITConfig` 之前先 `TIM_ClearFlag`，把这笔「历史账」清掉。
Q| 想统计一个外部方波的频率，用「定时器外部时钟模式 + 每 1 秒读一次 CNT」的做法，在 1kHz 信号下分辨率是多少？有什么局限？
A| 分辨率 1Hz（1 秒窗口内计到的脉冲数就是频率），对 1kHz 信号误差约 0.1%。
A| 局限：① 低频信号（比如 10Hz）在 1 秒窗口里只有 10 个脉冲，量化误差 10%；② 要等满 1 秒才出结果，响应慢。改进就是第 09 课的输入捕获——直接测一个周期的时长，低频时反而更准。
Q| 为什么定时器中断里不能调用 `Delay_ms()` 或 `printf()`？
A| `Delay_ms` 依赖 SysTick 或循环，会阻塞几毫秒；`printf` 要等串口发完（9600 波特率下发 10 个字符约 10ms）。两者都会让 1ms 的中断严重超时，导致后续中断被推迟或丢失。
A| 正确做法：中断里只置标志或累加计数，把显示、打印放到主循环。这也是「1ms 心跳 + 主循环处理」这个模式能撑住整个项目的原因。
