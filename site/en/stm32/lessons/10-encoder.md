# 10 · 编码器接口：正交解码测速
part: 第三篇 · 中断与定时器
video: P19 – P20 · TIM 编码器接口 / 编码器接口测速
level: 进阶
lead: 第 06 课用中断数编码器，一个脉冲进一次中断，转速一高 CPU 就被吃满。硬件编码器接口把「判向 + 计数」整件事交给了定时器：你只需要定期来读一次 CNT，CPU 占用几乎是零。
goals:
- 能解释正交编码的相位关系，说清「四倍频」是怎么来的
- 能用 `TIM_EncoderInterfaceConfig` 三步配好编码器接口
- 能处理 16 位 CNT 的溢出，用差值法算出转速
- 知道为什么编码器引脚必须上拉、极性配反了会怎样
stats: 5 个小节 · 4 张表 · 4 道练习

## 一、正交编码：相位差 90° 的两路方波

编码器内部是一个带缝隙的码盘加两对光电管，输出 A、B 两路方波，相位差 90°。转向决定谁超前：

| 转向 | 相位关系 | 观察点 |
| --- | --- | --- |
| 正转 | A 超前 B 90° | A 上升沿时，B 还是低 |
| 反转 | B 超前 A 90° | A 上升沿时，B 已是高 |

「四倍频」来自计数方式：如果只在 A 的上升沿计数，一圈 N 个脉冲；如果 **A、B 两个通道都数上升沿和下降沿**，一圈就是 4N 个计数。分辨率提高 4 倍，代价是同样转速下 CNT 增长快 4 倍。

| 计数模式 | 每个周期计几次 | 分辨率 | 对应库宏 |
| --- | --- | --- | --- |
| 只数 TI1 边沿 | 2（上升+下降） | 2× | `TIM_EncoderMode_TI1` |
| 只数 TI2 边沿 | 2 | 2× | `TIM_EncoderMode_TI2` |
| 两通道都数 | 4 | 4×（最常用） | `TIM_EncoderMode_TI12` |

## 二、三步配好编码器接口

编码器接口用的是定时器的通道 1 和通道 2，所以引脚必须选「CH1/CH2」那一对。以 TIM3 为例：CH1 = PA6、CH2 = PA7（也可以重映射到 PB4/PB5，或直接用 TIM2 的 PA0/PA1）。

```c
#include "stm32f10x.h"

void Encoder_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;
    TIM_ICInitTypeDef TIM_ICInitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM3, ENABLE);

    /* ① 两个引脚：上拉输入（编码器多为开集输出，必须上拉） */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_6 | GPIO_Pin_7;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② 时基：编码器模式下 PSC 固定为 0，ARR 设满量程 */
    TIM_TimeBaseStructure.TIM_Prescaler     = 0;
    TIM_TimeBaseStructure.TIM_Period        = 65536 - 1;
    TIM_TimeBaseStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode   = TIM_CounterMode_Up;
    TIM_TimeBaseStructure.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(TIM3, &TIM_TimeBaseStructure);

    /* ③ 通道配置（编码器模式下这两句是固定写法） */
    TIM_ICInitStructure.TIM_Channel     = TIM_Channel_1;
    TIM_ICInitStructure.TIM_ICPolarity  = TIM_ICPolarity_Rising;
    TIM_ICInitStructure.TIM_ICSelection = TIM_ICSelection_DirectTI;
    TIM_ICInitStructure.TIM_ICPrescaler = TIM_ICPSC_DIV1;
    TIM_ICInitStructure.TIM_ICFilter    = 0x0F;
    TIM_ICInit(TIM3, &TIM_ICInitStructure);

    TIM_ICInitStructure.TIM_Channel     = TIM_Channel_2;
    TIM_ICInitStructure.TIM_ICPolarity  = TIM_ICPolarity_Rising;
    TIM_ICInitStructure.TIM_ICSelection = TIM_ICSelection_DirectTI;
    TIM_ICInit(TIM3, &TIM_ICInitStructure);

    /* ④ 打开编码器接口：两通道都计数 → 四倍频 */
    TIM_EncoderInterfaceConfig(TIM3, TIM_EncoderMode_TI12,
                               TIM_ICPolarity_Rising, TIM_ICPolarity_Rising);

    TIM_SetCounter(TIM3, 0);
    TIM_Cmd(TIM3, ENABLE);
}
```

配好之后，**CNT 会随转动自动增减**：正转加，反转减。你不需要任何中断，读一次 `TIM_GetCounter(TIM3)` 就是当前位置。

## 三、读位置与算转速：差值法

CNT 是 16 位的，转到 65535 会回绕到 0，直接读数值会看到「65530 → 3」这种跳变。所以工程上一律用**两次读数之差**：

```c
/* 返回自上次调用以来转过的计数（正=正转，负=反转） */
int16_t Encoder_GetDelta(void)
{
    static uint16_t last = 0;
    uint16_t now = TIM_GetCounter(TIM3);
    int16_t delta = (int16_t)(now - last);   // 关键：转成有符号再减
    last = now;
    return delta;
}
```

`(int16_t)(now - last)` 这一句是整个测速的关键：无符号数相减再强转有符号，天然处理了回绕。比如 now = 3、last = 65530，`3 - 65530 = 9`（mod 65536），正好是实际前进的 9 个计数。

转速计算：

```c
/* 每 100ms 调用一次；每圈 4×N 个计数（N 为编码器线数，常见 11 或 20） */
float Motor_RPM(void)
{
    int16_t d = Encoder_GetDelta();
    float rev = (float)d / (4.0f * 11.0f);    // 转过的圈数
    return rev * 600.0f;                      // 每 100ms → 每分钟 ×600
}
```

| 量 | 公式 | 说明 |
| --- | --- | --- |
| 每圈计数 | 4 × 线数 | 四倍频；11 线 → 44 计数/圈 |
| 角速度 | Δ计数 / 每圈计数 × 2π / Δt | 弧度每秒 |
| 转速 RPM | Δ计数 / 每圈计数 / Δt × 60 | Δt 单位秒 |
| 线速度 | RPM × π × 轮径 / 60 | 小车里换算成 m/s |

## 四、坑：数字不动、只增不减、跳变

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 转起来数字完全不动 | 引脚不是 CH1/CH2 对应的脚，或忘了 `TIM_EncoderInterfaceConfig` | 查引脚表；确认调了编码器配置而不是普通输入捕获 |
| 正反转都在加 | CNT 方向被固定（`TIM_CounterMode_Up` + 极性配成同一相） | 用 `TIM_EncoderMode_TI12`，两个极性都设 `Rising` |
| 数值偶尔跳一大截 | 直接读 CNT 且发生回绕 | 用 `(int16_t)(now - last)` 差值法 |
| 静止时数字缓慢乱走 | 引脚没上拉，输入悬空捡噪声 | 加外部 10kΩ 上拉，或确认配了 `GPIO_Mode_IPU` |
| 转速比实际大一倍 | 每圈计数按「线数」算，没乘 4 | 四倍频要乘 4 |

:::warn 编码器模式会「占用」整个定时器
一旦配成编码器接口，这个定时器的 CNT 由外部脉冲驱动，**不能再拿它做定时中断或 PWM**（时钟源已经换成了 TI1/TI2）。
小车项目里通常这样分配：TIM2 做 PWM 驱动电机、TIM3/TIM4 做左右轮编码器、SysTick 或 TIM1 做控制周期。定时器不够用时才考虑软件解码。
:::

## 五、和中断方案对比：什么时候该换

| 指标 | EXTI 中断（第 06 课） | 硬件编码器接口（本课） |
| --- | --- | --- |
| CPU 占用 | 每个边沿一次中断，转速高时很重 | 接近 0，只在读的时候花几个周期 |
| 最高可测转速 | 受中断响应时间限制（约几千 Hz） | 受输入滤波器和引脚带宽限制（几十 kHz 以上） |
| 判向 | 软件读另一相判断 | 硬件自动 |
| 占用资源 | 2 条 EXTI 线 + 中断 | 1 个定时器 |
| 适合 | 低速、偶尔转一下（旋钮） | 连续旋转、需要测速（电机、车轮） |

判断标准很简单：**如果「转起来以后中断频率超过 10kHz」，就该换成硬件接口**。手拧的旋钮编码器用 EXTI 完全够；电机尾部的编码器必须用硬件接口。

## 练习
Q| 一个 11 线（每圈 11 个脉冲）的编码器，用四倍频模式，轮子转一圈 CNT 变化多少？转 20 圈呢？
A| 四倍频 = 每圈 4 × 11 = 44 个计数。转 20 圈 = 880 个计数。
A| 注意 880 没有超过 65535，所以不用处理溢出；但如果连续正转 1489 圈（65535/44）以上就会回绕，所以位置上要一直用差值法累计，不要只读瞬时值。
Q| `int16_t delta = (int16_t)(now - last);` 这一句为什么能自动处理 16 位回绕？
A| C 语言的整型提升规则：`now - last` 是两个 `uint16_t`，先提升为 `int` 做减法，结果为负时也是正确的数学差（如 3 − 65530 = −65527）。
A| 再强转成 `int16_t` 会按 16 位截断，−65527 mod 65536 = 9，正好等于「前进 9 个计数」。也就是说：只要两次读数之间的真实变化量小于 32768，这个写法永远正确。
Q| 编码器接在 PA6/PA7 上，代码也调了 `TIM_EncoderInterfaceConfig`，但转起来 CNT 一直是 0。最可能的原因是什么？
A| PA6/PA7 是 TIM3 的 CH1/CH2，但如果不做重映射，引脚功能默认就是 TIM3 通道——一般是能用的。真正常见的原因是：**引脚没上拉**（编码器是开集输出，悬空读不到有效电平），或**编码器没供电**（VCC/GND 漏接）。
A| 其次是 `TIM_Cmd(TIM3, ENABLE)` 没调，或只配了 `TIM_ICInit` 却漏了 `TIM_EncoderInterfaceConfig`（此时定时器还在用内部时钟数数，CNT 会自己涨，看起来「不转也在增加」）。
Q| 小车左轮编码器读数一直在增加，右轮一直在减少，但两个轮子明明都往前转。怎么统一？
A| 两个编码器装的方向相反（一个 A 相接 PA6，另一个 A 相接 PA7），导致硬件判向相反。
A| 代码上统一：右轮取负号 `delta = -delta;`，或在初始化时把 `TIM_EncoderInterfaceConfig` 的两个极性参数对调（`Rising/Falling`）。推荐在驱动层做一次符号统一，上层控制代码就不用关心左右差异。
