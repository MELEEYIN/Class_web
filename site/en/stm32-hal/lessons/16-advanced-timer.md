# 16 · 高级定时器：重复计数、互补与死区

part: 第四篇 · 定时器与看门狗
video: P101 – P109
level: 难点
lead: 高级定时器 TIM1 比通用定时器多了三样「电机/电源专用」的功能：重复计数器（发指定个数脉冲）、互补输出（一对反相 PWM）、死区与刹车（防止上下桥臂直通）。它们是三相电机、H 桥、逆变器的核心，也是定时器里最容易配错的部分。

goals:
- 能解释 RCR 如何让 TIM1 每 N+1 个周期才产生一次更新，从而输出指定个数 PWM
- 能配出 CH1/CH1N 互补输出，并算出死区时间对应的 DTG 值
- 能说清刹车（BKIN）输入的作用与配置
- 知道为什么「死区太小会炸管、太大波形失真」

stats: 1 个 RCR · 1 对互补通道 · 1 段死区

## 一、重复计数器：指定个数 PWM

通用定时器的更新事件是「每个周期一次」；TIM1 多了一个 **RCR（Repetition Counter）**：

```
每次溢出 → RCR 减 1 → 只有 RCR 减到 0 才产生更新事件，并重装 RCR
```

所以更新频率 = PWM 频率 / (RCR + 1)。它的典型用途：

- 让更新中断/ADC 触发按 N 个 PWM 周期发生一次，降低中断频率；
- 配「单脉冲模式」输出精确个数：RCR = N−1，再配合 `One Pulse Mode`，发完 N 个脉冲自动停。

### CubeMX 配置（TIM1，PA8/PA7）

1. **TIM1 → Channel1: PWM Generation CH1**；
2. Parameter Settings：
   - Prescaler = 71，Counter Period = 999（1kHz）
   - **Repetition Counter = 9**（每 10 个周期一次更新）
   - `One Pulse Mode` 视需求开启；
3. NVIC 勾 `TIM1 update interrupt`（若用中断计数）。

```c
/* 启动后，每 10 个 PWM 周期进一次更新中断 */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM1) {
        pulses_done += 10;
        if (pulses_done >= 100) {          /* 发满 100 个脉冲 */
            HAL_TIM_PWM_Stop(&htim1, TIM_CHANNEL_1);
        }
    }
}
```

> 精确个数最好用硬件「单脉冲 + RCR」，软件计数会被中断延迟影响；软件法只适合对个数要求不严的场合。

## 二、互补输出：一对反相 PWM

TIM1 的每个通道都有 `CHx` 和 `CHxN` 两个输出：

```
CH1  ─────┐        ┌────
          └────────┘
CH1N       ┌────────┐
      ─────┘        └────
          死区  死区
```

- `CH1` 与 `CH1N` 反相；
- 两者之间插入**死区**，保证上下桥臂不会同时导通（直通会烧 MOS）；
- 互补输出必须使能 `MOE`（主输出使能），HAL 在 `HAL_TIM_PWM_Start` 时会处理。

### CubeMX 配置

1. TIM1 → Channel1 选 `PWM Generation CH1 CH1N`；
2. Parameter Settings：
   - `Dead Time` 填 DTG 值（见下一节）
   - `Automatic Output State` = Enable
   - `Break State` 按需；
3. 引脚：PA8（CH1）、PB13（CH1N）；
4. 生成后先 `HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1)`，再 `HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1)`。

```c
HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);       /* CH1 */
HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);    /* CH1N */
__HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, 500);
```

> 只启动 `PWM_Start` 不启动 `PWMN_Start`，互补脚不会输出——这是「CH1 有波形、CH1N 没波形」的最常见原因。

## 三、死区时间：DTG 怎么算

死区由 `BDTR` 的 DTG[7:0] 编码，F1 的规则（tDTS = 1/72MHz ≈ 13.9ns）：

| DTG[7:5] | 公式 | 范围 |
|---|---|---|
| 0xx | DTG[7:0] × tDTS | 0–127 × 13.9ns ≈ 0–1.76µs |
| 10x | (64 + DTG[5:0]) × 2 × tDTS | 1.78–3.52µs |
| 110 | (32 + DTG[4:0]) × 8 × tDTS | 3.56–7.04µs |
| 111 | (32 + DTG[4:0]) × 16 × tDTS | 7.12–14.08µs |

例：要 1µs 死区 → 1µs / 13.9ns ≈ 72 → DTG = 72（0x48）。

HAL 里直接填 DTG 值：

```c
htim1.Init.DeadTime = 72;     /* 约 1µs */
```

死区不是越大越好：太小防不住直通，太大会让输出波形失真、有效电压下降。按 MOS 的关断时间 + 驱动延迟留 20–50% 余量。

## 四、刹车（BKIN）：紧急关断

刹车输入（BKIN）一旦有效，硬件立刻把 CHx/CHxN 拉到安全电平（可配空闲态），并置刹车标志，不需要 CPU 参与。典型用于过流保护：

```c
/* 刹车引脚 PB12，高电平有效 */
htim1.Init.BreakState = TIM_BREAK_ENABLE;
htim1.Init.BreakPolarity = TIM_BREAKPOLARITY_HIGH;
htim1.Init.AutomaticOutput = TIM_AUTOMATICOUTPUT_ENABLE;

/* 刹车中断里处理 */
void HAL_TIMEx_BreakCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM1) {
        motor_stop();
        printf("BREAK! check over-current\r\n");
    }
}
```

刹车后要恢复输出，必须清刹车标志并重新使能 MOE（`__HAL_TIM_MOE_ENABLE`），HAL 的 `HAL_TIMEx_ConfigBreakDeadTime()` 可重配。

## 五、坑：互补输出与死区

| 现象 | 原因 | 修法 |
|---|---|---|
| CH1N 没波形 | 没调 `HAL_TIMEx_PWMN_Start` | 补上 |
| 两路同时为高 | 死区为 0 / 没配 | 填 DTG，检查 MOS 驱动 |
| 死区时间不对 | tDTS 按 36MHz 算 | 定时器时钟是 72MHz |
| 刹车后不恢复 | MOE 没重新使能 | 清标志 + `__HAL_TIM_MOE_ENABLE` |
| 只有前几个脉冲 | RCR/单脉冲配错 | 检查 RCR 与 One Pulse |
| 更新中断频率不对 | 忘了 RCR 会分频 | 中断频率 = PWM/(RCR+1) |

## 练习

Q| TIM1 的 PWM 频率 1kHz、RCR=9，更新中断多久进一次？如果想每 100 个 PWM 周期触发一次 ADC，RCR 该填多少？
A| 更新频率 = 1kHz/(9+1) = 100Hz，即每 10ms 一次。要每 100 个周期一次，RCR = 99（更新频率 10Hz）。

Q| 死区 1µs，tDTS=13.9ns，DTG 应该填多少？如果把定时器时钟误按 36MHz 算，实际死区会偏大还是偏小？
A| 1µs/13.9ns ≈ 72，DTG 填 72（0x48），对应约 999ns。若按 36MHz 算（tDTS=27.8ns），会以为 1µs 只需 36，实际填 36 只有约 0.5µs，死区偏小——上下桥臂仍有直通风险。

Q| 为什么互补 PWM 必须先启动 CH1 再启动 CH1N？只启动 CH1 会怎样？
A| `HAL_TIM_PWM_Start` 使能通道 1 的输出与计数器，`HAL_TIMEx_PWMN_Start` 单独使能互补通道的输出。只启动 CH1 时 CH1N 的输出使能位仍为 0，引脚保持无效电平（或高阻），所以看不到互补波形。两者都启动后，MOE 才真正控制整组输出。

Q| 刹车输入和普通中断有什么区别？为什么过流保护要用硬件刹车而不是在中断里关 PWM？
A| 刹车是硬件路径：BKIN 有效后，定时器在几十纳秒内直接把输出拉到安全态，不经过 CPU、不受中断延迟和优先级影响；普通中断要等 CPU 响应、进服务函数、再写寄存器，微秒级延迟对 MOS 来说已经太慢。过流/短路必须用硬件刹车（或驱动芯片自带的保护），软件只做事后记录与恢复。