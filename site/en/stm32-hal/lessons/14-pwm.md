# 14 · 通用定时器 PWM 输出

part: 第四篇 · 定时器与看门狗
video: P91 – P95
level: 基础
lead: PWM 是「用数字口输出模拟效果」的万能工具：调 LED 亮度、控舵机角度、调电机转速，都是同一件事——固定频率，改占空比。F1 的通用定时器 TIM2/3/4 每个都有 4 个通道，配好时基再配通道，就能输出 4 路独立 PWM。

goals:
- 能解释 PWM 模式 1/2 的区别，说清 CCR 与占空比的关系
- 能独立算出 PWM 频率与占空比对应的 PSC/ARR/CCR
- 能用 CubeMX + HAL 输出 PWM，并用 `__HAL_TIM_SET_COMPARE` 动态调节
- 能做出呼吸灯与 50Hz 舵机控制，知道两者的参数差别

stats: 4 个通道 · 2 种 PWM 模式 · 2 个实战

## 一、PWM 是怎么产生的

通用定时器的输出比较部分：

```
CNT（计数） ──► 比较器 ◄── CCR（比较值）
                  │
                  ▼
             OCxREF ──► 输出模式/极性 ──► 引脚
```

- **PWM 模式 1**：`CNT < CCR` 时输出有效电平，否则无效；
- **PWM 模式 2**：反过来，`CNT < CCR` 时无效；
- **有效电平**由极性（高/低）决定，CubeMX 里 `CH Polarity` 选 High 就是高电平有效。

频率与占空比：

```
fPWM = fCK / ((PSC + 1) × (ARR + 1))
占空比 = CCR / (ARR + 1)
```

以 72MHz、1kHz 为例：PSC=71（→1MHz）、ARR=999（→1kHz），CCR=300 时占空比 30%。

## 二、CubeMX 配置

1. **Timers → TIM2**：Clock Source = Internal Clock；
2. **Channel1** 选 `PWM Generation CH1`；
3. Parameter Settings：
   - Prescaler = 71
   - Counter Period = 999
   - Pulse = 0（初始占空比 0）
   - CH Polarity = High
4. 引脚图确认 **PA0** 被分配给 TIM2_CH1；
5. 生成后 `tim.c` 有 `MX_TIM2_Init()`。

> 通道与引脚是绑定的：TIM2_CH1 可以是 PA0/PA15，TIM2_CH2 是 PA1/PB3，TIM3_CH1 是 PA6/PB4。CubeMX 点通道时会显示可用脚，选一个没被占用的。

## 三、HAL 代码：启动与调占空比

```c
/* main.c */
TIM_HandleTypeDef htim2;

/* USER CODE BEGIN 2 */
HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);     /* 启动通道 1 的 PWM */
/* USER CODE END 2 */

/* USER CODE BEGIN 3 */
for (uint16_t i = 0; i <= 1000; i += 10) {
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, i);   /* 改 CCR */
    HAL_Delay(10);
}
/* USER CODE END 3 */
```

调占空比的三种写法：

```c
__HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 300);   /* 直接写 CCR */
htim2.Instance->CCR1 = 300;                          /* 裸寄存器，效果相同 */
HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);            /* 只启动，不改变 CCR */
```

运行中改 CCR 是安全的：CCR 有预装载，默认在更新事件时生效（CubeMX 里 `CH1 Preload` 建议 Enable），避免半周期改值产生毛刺。

## 四、实战 1：呼吸灯

```c
uint16_t duty = 0;
int8_t   dir  = 1;

while (1)
{
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, duty);
    duty += dir * 10;
    if (duty >= 1000) { duty = 1000; dir = -1; }
    if (duty <= 0)    { duty = 0;    dir = 1; }
    HAL_Delay(10);
}
```

LED 接 PA0（PWM 输出）与 GND，串 1kΩ。频率 1kHz 高于人眼闪烁感知，看到的是亮度变化；频率低于 50Hz 会看到闪烁。

## 五、实战 2：50Hz 舵机

SG90 舵机要求 **50Hz（20ms）**，高电平 0.5–2.5ms 对应 0–180°：

```
PSC = 71      → 1MHz 计数
ARR = 19999   → 20ms 周期（50Hz）
CCR = 500     → 0.5ms  → 0°
CCR = 1500    → 1.5ms  → 90°
CCR = 2500    → 2.5ms  → 180°
```

```c
/* 角度 → CCR：5 + angle × 20 / 180（单位 0.1ms？不，这里 CCR 单位是 1us） */
uint32_t angle_to_ccr(uint8_t angle)
{
    return 500 + (uint32_t)angle * 2000 / 180;   /* 500–2500us */
}

__HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, angle_to_ccr(90));
```

舵机信号接 PA1（TIM2_CH2），电源单独 5V、与单片机共地；舵机启动电流大，不要从板子的 3.3V 取电。

## 六、坑：PWM 没波形/舵机乱抖

| 现象 | 原因 | 修法 |
|---|---|---|
| 引脚一直是低 | 没启动 PWM / 配成普通输出 | `HAL_TIM_PWM_Start`，CubeMX 选 PWM Generation |
| 频率差 2 倍 | 定时器时钟按 36MHz 算了 | F1 定时器时钟 = PCLK×2 = 72MHz |
| 占空比不线性 | ARR 与 CCR 单位搞错 | 占空比 = CCR/(ARR+1) |
| 调占空比有毛刺 | CCR 预装载没开 | 开 `CHx Preload`，改值等更新 |
| 舵机抖/发热 | 频率不是 50Hz / 电源不稳 | 20ms 周期，独立 5V 供电 |
| 呼吸灯有闪烁 | PWM 频率太低（<100Hz） | 提高到 1kHz 以上 |

## 练习

Q| 72MHz、PSC=71、ARR=999 时 PWM 频率是多少？CCR=250 时占空比是多少？把频率改成 20kHz，PSC 不变时 ARR 该填多少？
A| 计数时钟 1MHz，周期 1000 个数 → 1kHz。占空比 = 250/1000 = 25%。20kHz 时周期 50µs，1MHz 计数需要 50 个数，ARR = 49；若 ARR 固定 999，则 PSC 要改成 3（72/4 = 18MHz，18MHz/1000 = 18kHz，接近但不精确，最好用 ARR 调）。

Q| PWM 模式 1 和模式 2 的区别是什么？如果 LED 是低电平点亮，`CH Polarity` 应该怎么设？
A| 模式 1：CNT < CCR 时输出有效电平；模式 2：CNT < CCR 时输出无效电平。有效电平再由极性决定。LED 低电平点亮时，把 Polarity 设为 Low，这样「有效」就是低电平，CCR 越大亮度越高；也可以 Polarity=High 但把 CCR 反过来算。两种都行，关键是统一，别一半代码按高有效、一半按低有效。

Q| 舵机控制为什么必须用 50Hz？CCR 从 500 改到 2500 对应什么？如果定时器配置成 1kHz 会怎样？
A| SG90 这类舵机的内部基准是 20ms 周期，控制脉宽 0.5–2.5ms 对应角度；50Hz 是行业标准。CCR=500 对应 0.5ms（0°），2500 对应 2.5ms（180°）。配成 1kHz（1ms 周期）时，脉宽 1.5ms 已经超过整个周期，舵机收到的信号无效，表现为不动、抖动或发热。

Q| 运行中直接改 `htim2.Instance->CCR1` 与 `__HAL_TIM_SET_COMPARE` 有区别吗？为什么建议开 CCR 预装载？
A| 两者最终都是写 CCR1 寄存器，效果相同（宏只是加类型转换/可读性）。区别在预装载：开了 `OCxPE` 后，写 CCR 只是写预装载寄存器，真正生效在下一个更新事件，避免在一个 PWM 周期中间改值造成窄脉冲/毛刺；不开则立即生效，可能在当前周期产生一个异常占空比。动态调光/调速建议开预装载。