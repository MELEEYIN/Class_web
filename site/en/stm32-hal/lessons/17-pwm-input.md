# 17 · PWM 输入模式

part: 第四篇 · 定时器与看门狗
video: P110 – P113
level: 难点
lead: 用输入捕获测占空比要来回切极性，麻烦且容易漏边沿。PWM 输入模式把这件事交给硬件：一个通道测周期（上升沿到上升沿），另一个通道测高电平（上升沿到下降沿），两个 CCR 同时就绪，读一次就能算出频率和占空比。它是读遥控接收机、转速传感器、PWM 型编码器最省事的办法。

goals:
- 能画出 PWM 输入模式的信号路径：TI1 → IC1（周期）与 TI1 → IC2（高电平）
- 能解释「从模式复位」为什么让 CNT 在每个上升沿清零
- 能用 CubeMX 的 `PWM Input on CH1` 一次配好两路捕获
- 能在回调里用 CCR1/CCR2 算出频率与占空比

stats: 1 个输入 · 2 个捕获通道 · 2 个结果

## 一、原理：一个引脚，两路捕获

PWM 输入模式的核心是「信号同时送到两个捕获通道」：

```
TI1（引脚） ──► IC1 ──► 上升沿捕获 ──► CCR1（周期）
           └──► IC2 ──► 下降沿捕获 ──► CCR2（高电平）
                    ▲
       从模式复位：上升沿把 CNT 清零
```

配合 **从模式复位（Slave Mode Reset）**：每个上升沿把 CNT 归零，于是

```
CCR1 = 一个完整周期的计数值
CCR2 = 高电平持续的计数值
频率 = 计数时钟 / CCR1
占空比 = CCR2 / CCR1
```

两次捕获由硬件同时完成，不存在「软件切极性漏边沿」的问题。

## 二、CubeMX 配置（TIM3_CH1 / PA6）

1. **TIM3 → Channel1** 选 **`PWM Input on CH1`**（不是 Input Capture direct）；
2. Parameter Settings 会自动填好：
   - Prescaler = 71（1MHz）
   - Counter Period = 65535
   - IC1 Polarity = Rising，IC2 Polarity = Falling
   - IC1 Selection = Direct，IC2 Selection = Indirect
   - **Slave Mode = Reset Mode**
   - Trigger Source = TI1FP1
3. NVIC 勾 `TIM3 global interrupt`；
4. 生成后 `MX_TIM3_Init()` 已经配好两路 IC 与从模式。

> 不要手动改 IC2 的极性/选择，PWM Input 模式依赖「IC2 间接映射到 TI1」这一组固定配置；改一处就可能只剩一路捕获。

## 三、HAL 代码

```c
TIM_HandleTypeDef htim3;

volatile uint32_t period_cnt = 0;
volatile uint32_t high_cnt   = 0;
volatile uint8_t  updated    = 0;

/* USER CODE BEGIN 2 */
HAL_TIM_IC_Start_IT(&htim3, TIM_CHANNEL_1);   /* 周期通道 */
HAL_TIM_IC_Start_IT(&htim3, TIM_CHANNEL_2);   /* 高电平通道 */
/* USER CODE END 2 */

/* USER CODE BEGIN 4 */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM3) {
        period_cnt = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        high_cnt   = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_2);
        updated    = 1;
    }
}
/* USER CODE END 4 */
```

主循环换算（1MHz 计数）：

```c
if (updated) {
    updated = 0;
    if (period_cnt > 0) {
        uint32_t freq = 1000000U / period_cnt;
        uint32_t duty = (uint64_t)high_cnt * 100U / period_cnt;
        printf("f=%luHz duty=%lu%%\r\n", freq, duty);
    }
}
```

> 先算 `period_cnt` 再算 `high_cnt` 有极小的窗口误差（两次读之间可能来了新边沿）；对精度要求高时，在回调里一次性读两个 CCR，或用 DMA 搬运。`updated` 用 `volatile`，主循环读完清标志。

## 四、量程与分辨率

| 参数 | 影响 |
|---|---|
| PSC 越小 | 分辨率越高，但最大周期越短（16 位溢出） |
| PSC=71（1MHz） | 分辨率 1µs，最大周期 65.5ms（约 15Hz 以上） |
| PSC=719（100kHz） | 分辨率 10µs，最大周期 655ms（约 1.5Hz 以上） |
| 高频信号 | 用更小的 PSC，甚至 PSC=0（72MHz 计数） |

PWM 输入模式同样受 16 位限制：信号周期超过 65.5ms（PSC=71 时）会溢出，读到的 CCR 是回绕后的值。低频信号先把 PSC 加大，或改用捕获 + 溢出补偿。

## 五、实战：读遥控接收机

航模接收机输出 50Hz PWM，脉宽 1000–2000µs 对应摇杆位置。配置同上（PSC=71），读 `high_cnt` 即可：

```c
uint32_t pulse_us = high_cnt;          /* 1MHz 计数，1 个数 = 1µs */
uint32_t throttle = (pulse_us - 1000) * 100 / 1000;   /* 0–100% */
```

注意接收机信号是 5V 电平，接 3.3V 单片机前要确认引脚是否 FT（5V 容忍），否则加分压/电平转换。

## 六、坑：PWM 输入读数不对

| 现象 | 原因 | 修法 |
|---|---|---|
| 只有周期没有高电平 | 只启动了 CH1，没启动 CH2 | 两路都 `Start_IT` |
| 占空比恒为 0/100% | 极性配反 / IC2 没映射到 TI1 | 用 CubeMX 的 PWM Input 预设，不要手改 |
| 频率差一倍 | 从模式没设 Reset / 触发源错 | Slave Mode = Reset，Trigger = TI1FP1 |
| 低频读数乱 | CNT 溢出 | 加大 PSC 或做溢出补偿 |
| 读数偶尔跳 | 信号抖动/干扰 | 开 IC Filter，缩短线，加硬件滤波 |
| 回调只进一次 | 没重新启动 / 中断被关 | 检查 `Start_IT` 与 NVIC |

## 练习

Q| PWM 输入模式为什么需要「从模式复位」？如果没有它，CCR1/CCR2 还能直接算周期和占空比吗？
A| 从模式复位让每个上升沿把 CNT 清零，于是 CCR1 直接就是「一个完整周期的计数」，CCR2 是「从上升沿到下降沿的计数」，两者同一基准，直接相除得占空比。没有复位时 CNT 自由跑，CCR 是绝对时间戳，要自己记录两次上升沿的差值并处理溢出，计算复杂且容易错。

Q| 1MHz 计数下，CCR1=2000、CCR2=500，信号的频率和占空比是多少？如果 PSC 改成 719，同样的波形 CCR1/CCR2 会变成多少？
A| 1MHz 时周期 2000µs=2ms → 500Hz；占空比 500/2000=25%。PSC=719 时计数 100kHz（10µs 一个数），周期 2ms 对应 200 个数，高电平 0.5ms 对应 50 个数，即 CCR1=200、CCR2=50，比值不变。

Q| 为什么 PWM 输入模式比「单通道双边沿捕获」更适合测占空比？
A| 单通道双边沿要在回调里切换极性（上升→下降→上升），每次切换都有软件延迟，且切换期间可能漏掉边沿；高占空比/高频时尤其明显。PWM 输入模式用两个硬件捕获通道同时工作，边沿由硬件分派，不需要软件干预，读数稳定且不占 CPU。

Q| 读航模接收机的 5V PWM 信号，直接接 PA6 有什么风险？怎么判断能不能直连？
A| PA6 在 F103 上不是 FT（5V 容忍）引脚时，5V 输入会通过内部保护二极管灌电流，长期可能损坏芯片；即使是 FT 脚，也只能承受有限电流。查数据手册引脚表的 `FT` 标记：带 FT 的可 5V 输入，但仍建议串 1kΩ 限流；不带的必须分压（如 10k/20k）或用电平转换芯片。最稳的是先量信号高电平，再决定。