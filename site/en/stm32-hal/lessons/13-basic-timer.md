# 13 · 基本定时器与定时中断

part: 第四篇 · 定时器与看门狗
video: P86 – P90
level: 基础
lead: 定时器是单片机里最「值钱」的外设：它不占 CPU、精度高、还能衍生出 PWM、输入捕获、编码器。F1 的基本定时器 TIM6/TIM7 功能最少，正好用来把「预分频 → 计数 → 溢出 → 中断」这条链讲清楚，后面通用/高级定时器都是在这条链上加功能。

goals:
- 能画出基本定时器的时钟路径：PSC → CNT → ARR → 更新事件
- 能独立算出任意定时周期对应的 PSC 与 ARR，并知道 16 位上限
- 能用 CubeMX + HAL 配出 1ms/1s 定时中断，在回调里做心跳
- 能区分「更新中断」与「更新事件」，知道预装载（ARPE）的作用

stats: 3 个寄存器 · 1 条定时公式 · 2 个回调

## 一、基本定时器里有什么

TIM6/TIM7 的结构极简：

```
内部时钟 CK_INT（72MHz）
   │
   ▼
┌─────────┐   ┌─────────┐   ┌─────────┐
│  PSC    │──►│  CNT    │──►│  ARR    │──► 更新事件 UE
│ 预分频  │   │ 计数器  │   │ 自动重装│      ├─ 更新中断 UIE
└─────────┘   └─────────┘   └─────────┘      └─ 触发 DAC/ADC
```

| 寄存器 | 作用 | 16 位范围 |
|---|---|---|
| `PSC` | 把 72MHz 分频成计数时钟 | 0–65535（实际 ÷(PSC+1)） |
| `CNT` | 当前计数值，自动递增 | 0–65535 |
| `ARR` | 计到多少溢出并重装 | 0–65535 |

计数时钟：

```
fCNT = fCK / (PSC + 1)
```

溢出周期：

```
T = (PSC + 1) × (ARR + 1) / fCK
```

以 72MHz、1ms 为例：取 PSC=71（→1MHz），ARR=999（→1000 个数）→ T = 1000/1MHz = 1ms。

以 72MHz、1s 为例：PSC=7199（→10kHz），ARR=9999（→10000 个数）→ T = 1s。

> **16 位上限**：单靠 PSC/ARR 最大定时 = 65536×65536/72e6 ≈ 59.6s。要更长，用「定时中断里再计数」的软件分频。

## 二、更新事件与预装载

- **更新事件（UE）**：CNT 从 ARR 回到 0 时产生，可以触发中断、DMA、DAC；
- **更新中断（UIE）**：UE 使能到 NVIC 的那一路；
- **ARPE（自动重装载预装载）**：置 1 时，写 ARR 先写入影子寄存器，等下一次更新才生效，避免运行中改周期产生毛刺。CubeMX 默认开启。

上电第一次计数也会产生一次更新事件（因为要装载 ARR/PSC），这就是「定时器一开就多进一次中断」的原因。处理办法：启动前先 `__HAL_TIM_CLEAR_FLAG(&htim6, TIM_FLAG_UPDATE)`，或第一次中断里忽略。

## 三、CubeMX 配置

1. **Timers → TIM6**：Clock Source 选 `Internal Clock`；
2. **Parameter Settings**：
   - Prescaler = 71
   - Counter Mode = Up
   - Counter Period = 999
   - auto-reload preload = Enable
3. **NVIC Settings**：勾 `TIM6 global interrupt`；
4. 生成后 `tim.c` 里有 `MX_TIM6_Init()`。

## 四、HAL 代码：启动与回调

```c
/* main.c */
TIM_HandleTypeDef htim6;

/* USER CODE BEGIN 2 */
HAL_TIM_Base_Start_IT(&htim6);      /* 启动计数 + 开更新中断 */
/* USER CODE END 2 */

/* USER CODE BEGIN 4 */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM6) {
        static uint32_t ms = 0;
        ms++;
        if (ms % 1000 == 0) {
            HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);   /* 每 1s 翻转 */
        }
    }
}
/* USER CODE END 4 */
```

注意：

- `HAL_TIM_Base_Start_IT()` 才会开中断；只调 `HAL_TIM_Base_Start()` 不会进回调；
- `HAL_TIM_PeriodElapsedCallback()` 是所有定时器共用的弱函数，多个定时器要用 `htim->Instance` 区分；
- 回调里只做计数/置标志，耗时逻辑放主循环。

## 五、定时器还能这么用

| 需求 | 做法 |
|---|---|
| 更长的定时（>59s） | 1ms 中断里软件计数，或级联定时器 |
| 精确的 1ms 心跳 | 基本定时器 + 中断，比 `HAL_Delay` 更可控 |
| 触发 ADC 采样 | TIM6 的 TRGO 连到 ADC 外部触发 |
| 触发 DAC | TIM6 TRGO 触发 DAC 转换 |
| 不占 CPU 的延时 | 定时器 + 状态机 |

## 六、坑：定时器时间总是不对

| 现象 | 原因 | 修法 |
|---|---|---|
| 周期差 2 倍 | APB1 预分频≠1，定时器时钟是 PCLK×2 | 用 72MHz 算，别用 36MHz |
| 一启动就进一次中断 | 初始更新事件 | 启动前清标志 |
| 改 ARR 没生效 | ARPE 开启，等更新 | 写 ARR 后等一次更新，或关 ARPE |
| 中断不进 | 只调了 `Start` 没调 `Start_IT` / NVIC 没开 | 改 `Start_IT`，查 NVIC |
| 回调不进 | 函数名/签名不对 | 必须是 `HAL_TIM_PeriodElapsedCallback` |
| 时间越来越慢 | 中断里做了长任务，计数被拖 | 中断里只置标志 |

## 练习

Q| 72MHz、PSC=7199、ARR=9999 时，定时周期是多少？如果想得到 500ms，保持 PSC 不变，ARR 应该是多少？
A| T = (7199+1)×(9999+1)/72e6 = 7200×10000/72e6 = 1s。500ms 时保持 PSC=7199（10kHz），需要 5000 个数，ARR = 4999。注意 ARR 是「计到该值溢出」，所以计数个数 = ARR+1。

Q| 为什么 TIM2/3/4 挂 APB1（36MHz），但算 PWM 周期时却用 72MHz？基本定时器 TIM6/7 也这样吗？
A| F1 的规则：APB 预分频≠1 时，定时器时钟 = PCLK×2。APB1 是 ÷2（36MHz），所以 TIM2/3/4 的计数时钟是 72MHz。TIM6/7 也挂 APB1，同样享受 ×2，也是 72MHz。只有 I2C、USART2/3 等非定时器外设按 36MHz 算。CubeMX 的时钟树会用橙色标出定时器时钟，可以直接看到。

Q| 更新中断和更新事件有什么区别？只想触发 ADC 而不进中断，应该怎么配？
A| 更新事件是定时器内部信号（UE），可以由 CNT 溢出产生；更新中断是把这个事件送到 NVIC（UIE 位）。触发 ADC/DAC 用事件（TRGO 输出），不需要开 UIE，也不需要在 NVIC 里使能；开 UIE 会多一次中断开销。CubeMX 里在 TIM 的 Trigger Output (TRGO) 选 `Update Event`，ADC 里选对应的外部触发源。

Q| 定时器中断里执行 `HAL_Delay(1)` 会发生什么？为什么定时器中断里不能做耗时操作？
A| `HAL_Delay` 等 SysTick；如果 TIM 中断优先级高于 SysTick，SysTick 无法抢占，`uwTick` 停止，程序永远卡在中断里，主循环和看门狗都停。即便优先级低于 SysTick，中断里阻塞 1ms 也会让其他中断延迟、定时抖动。定时器中断应只做计数、置标志、翻转 IO，耗时处理交给主循环。