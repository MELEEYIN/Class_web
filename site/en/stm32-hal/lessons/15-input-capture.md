# 15 · 输入捕获与脉宽测量

part: 第四篇 · 定时器与看门狗
video: P96 – P100
level: 进阶
lead: PWM 是「定时器往外发」，输入捕获是「定时器往里量」：引脚上的边沿一到，硬件立刻把当前 CNT 抄进 CCR，误差只有一个计数周期。用它测频率、测脉宽、测占空比，比软件轮询准得多，也不占 CPU。

goals:
- 能画出输入捕获通路：引脚 → 滤波/边沿 → 捕获寄存器 CCR
- 能测出方波的周期与高电平时间，并换算成频率/占空比
- 能用 CubeMX + HAL 配出捕获中断，在回调里读 CCR
- 能处理计数器溢出，避免「频率越低越不准」

stats: 1 个捕获寄存器 · 2 个边沿 · 1 个溢出问题

## 一、捕获通路

```
引脚 ─► 输入滤波 ─► 边沿检测 ─► 捕获事件 ─► CCRx = CNT
                                      │
                                      └─► 捕获中断 CCxIE
```

- 每个通道有一个 CCR，捕获发生时硬件把 CNT 复制进去；
- 可以选上升沿、下降沿或双边沿；
- 输入滤波（IC Filter）能滤掉窄脉冲，但会引入延迟；
- 捕获不会停计数器，CNT 继续跑，所以两次捕获的差值就是时间。

### 测周期与占空比

```
两次上升沿之间的差值 ΔT = (CCR2 - CCR1)（或加溢出补偿）
频率 = 1 / (ΔT × 计数周期)
高电平时间 = 下降沿捕获值 - 上升沿捕获值
占空比 = 高电平时间 / 周期
```

计数周期 = (PSC+1)/72MHz。例如 PSC=71，计数周期 1µs；ΔT=1000 → 1ms → 1kHz。

## 二、CubeMX 配置

以 TIM3_CH1（PA6）测频率为例：

1. **Timers → TIM3**：Clock Source = Internal Clock；
2. **Channel1** 选 `Input Capture direct mode`；
3. Parameter Settings：
   - Prescaler = 71（1MHz 计数，1µs 分辨率）
   - Counter Period = 65535（最大）
   - IC Polarity = Rising Edge
   - IC Selection = Direct
   - IC Prescaler = No division
   - IC Filter = 0（干净信号）
4. **NVIC** 勾 `TIM3 global interrupt`；
5. PA6 接信号源（信号幅度 3.3V，共地）。

## 三、HAL 代码：测频率

```c
TIM_HandleTypeDef htim3;

volatile uint32_t last_capture = 0;
volatile uint32_t period_us    = 0;
volatile uint8_t  captured     = 0;

/* USER CODE BEGIN 2 */
HAL_TIM_IC_Start_IT(&htim3, TIM_CHANNEL_1);
/* USER CODE END 2 */

/* USER CODE BEGIN 4 */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM3 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1) {
        uint32_t now = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        if (captured) {
            period_us = now - last_capture;   /* 无溢出时成立 */
            captured  = 1;
        }
        last_capture = now;
        captured = 1;
    }
}
/* USER CODE END 4 */
```

主循环换算：

```c
if (period_us) {
    uint32_t freq = 1000000U / period_us;     /* 1MHz 计数 */
    printf("period=%luus freq=%luHz\r\n", period_us, freq);
}
```

> `HAL_TIM_ReadCapturedValue()` 返回的是捕获时刻的 CNT。`htim->Channel` 在回调里表示哪个通道触发，多通道时要判断。

## 四、测占空比：一个通道 + 双边沿

把 IC Polarity 改成 `Both Edges`，回调里交替记录高/低：

```c
static uint32_t rise = 0, fall = 0;
static uint8_t  state = 0;

void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance != TIM3) return;

    uint32_t v = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
    if (state == 0) {          /* 上升沿 */
        rise = v;
        state = 1;
        __HAL_TIM_SET_CAPTUREPOLARITY(htim, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_FALLING);
    } else {                   /* 下降沿 */
        fall = v;
        state = 0;
        __HAL_TIM_SET_CAPTUREPOLARITY(htim, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_RISING);

        uint32_t high = fall - rise;
        /* 需要下一次上升沿才能得到周期，这里只算高电平 */
    }
}
```

实际工程更常用 **PWM 输入模式**（第 17 课）：一个通道测周期、一个通道测高电平，硬件自动算，不用来回切极性。

## 五、溢出：低频测量绕不过去的坑

CNT 是 16 位，1MHz 计数时最大 65.535ms；信号低于约 15Hz，两次捕获之间 CNT 会溢出（从 65535 回到 0），直接相减会得到错误的小值。

处理办法：

- 在更新中断里累计溢出次数：

```c
volatile uint32_t overflow = 0;

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM3) overflow++;
}

/* 计算周期：加上溢出补偿 */
period_us = (now - last_capture) + overflow * 65536U;
```

- 或者降低计数时钟（PSC 加大），牺牲分辨率换量程；
- 高频信号则相反：PSC 调小、提高分辨率。

## 六、坑：捕获值乱跳/测不到

| 现象 | 原因 | 修法 |
|---|---|---|
| 完全没捕获 | 没开捕获中断 / 引脚没配成 IC | `HAL_TIM_IC_Start_IT`，CubeMX 选 Input Capture |
| 捕获值乱跳 | 信号抖动/噪声 | 开 IC Filter，缩短线，加硬件滤波 |
| 低频测出来偏大 | CNT 溢出没补偿 | 累计溢出次数 |
| 高频测不准 | 计数分辨率不够 | 降低 PSC，提高计数频率 |
| 占空比总是不对 | 极性/边沿理解反 | 确认捕获的是高电平还是低电平 |
| 回调不进 | 通道号判断错 | `htim->Channel == HAL_TIM_ACTIVE_CHANNEL_x` |

## 练习

Q| PSC=71、1MHz 计数，两次上升沿捕获值相差 2000，信号频率是多少？如果 PSC=719，差值仍为 2000，频率又是多少？
A| PSC=71 时计数周期 1µs，ΔT=2000µs=2ms，频率 500Hz。PSC=719 时计数周期 10µs，ΔT=20ms，频率 50Hz。分辨率降低 10 倍，低频量程扩大 10 倍。

Q| 为什么输入捕获测频率比「定时器中断里软件计数」更准？
A| 捕获是硬件在边沿瞬间把 CNT 复制到 CCR，误差只来自计数时钟（±1 个计数周期），不受中断延迟影响；软件计数依赖中断响应，中断被高优先级任务拖延时就会漏计/多计，信号频率越高误差越大。捕获适合高频、精确测量，软件计数适合低频、粗略统计。

Q| 测 10Hz 方波时，PSC=71、ARR=65535，会出现什么问题？怎么改？
A| 10Hz 周期 100ms，而 1MHz 计数下 16 位 CNT 每 65.535ms 溢出一次，两次捕获之间至少溢出一次，直接相减得到的是错误的小值。改法：① 累计更新中断的溢出次数并补偿；② 把 PSC 加大到 7199（10kHz 计数，量程 6.5s），牺牲分辨率；③ 用 32 位定时器（F1 没有，换系列）。

Q| 捕获回调里读 CCR 之后，为什么还要考虑「下一次捕获已经把 CCR 覆盖」的问题？应该怎么读最稳？
A| CCR 只有一份，新的捕获会立刻覆盖旧值；如果回调执行慢，可能读到的是下一次的值。最稳的是在回调里第一时间读 `HAL_TIM_ReadCapturedValue()`（它读 CCR），并保证回调足够短；多通道共享时用 `htim->Channel` 区分；不要在回调里做 printf/长运算。必要时用 DMA 把 CCR 搬到内存（F1 的捕获 DMA 支持有限，通常还是靠短回调）。