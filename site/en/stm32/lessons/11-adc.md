# 11 · ADC：把电压读成 12 位数字
part: 第四篇 · 模拟与数据通路
video: P21 – P22 · ADC 模数转换器 / AD 单通道、AD 多通道
level: 进阶
lead: ADC 干的事很朴素：拿一个已知的参考电压，跟输入电压一刀一刀地「比」下去，比 12 次就得到一个 12 位的数字。所以它的分辨率、量程、速度，全由「参考电压」和「比几次」决定。
goals:
- 能算出 12 位 ADC 在 3.3V 参考下的分辨率，并把读数换算回电压
- 能独立配出单通道单次转换，并接上电位器读值
- 能用「扫描 + 轮流读」的方式采多路电压
- 知道引脚必须配模拟输入、转换前必须校准
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、12 位、3.3V：一个数代表多少伏

STM32F103 的 ADC 是逐次逼近型（SAR），12 位分辨率，参考电压默认就是 VDDA（3.3V）：

| 项目 | 数值 | 说明 |
| --- | --- | --- |
| 分辨率 | 12 位 = 4096 档 | 读数范围 0–4095 |
| 参考电压 | 3.3V | 接 VDDA，可外部给更稳的基准 |
| 最小可分辨电压 | 3.3V / 4096 ≈ 0.806mV | 也就是「1 个 LSB」 |
| 最大转换速率 | 1μs（1MSPS） | ADCCLK = 14MHz、采样时间 1.5 周期时 |
| ADCCLK 上限 | 14MHz | PCLK2 = 72MHz，必须 ÷6 或更多 |

换算只有一条式子：

**电压 = 读数 × 3.3 / 4096**

反过来，想知道某个电压会被读成多少：**读数 = 电压 / 3.3 × 4096**。实测时总会差几个 LSB，因为参考电压本身有误差、输入阻抗会分压、电源有纹波。

## 二、通道与引脚：一张必查表

| 通道 | 引脚 | 常用接法 |
| --- | --- | --- |
| ADC1_IN0 | PA0 | 电位器中间抽头 |
| ADC1_IN1 | PA1 | 光敏电阻 AO |
| ADC1_IN2 | PA2 | 热敏电阻 AO |
| ADC1_IN3 | PA3 | 麦克风模块 AO |
| ADC1_IN4 | PA4 | 外部信号 |
| ADC1_IN8 | PB0 | 外部信号 |
| ADC1_IN9 | PB1 | 外部信号 |
| ADC1_IN16 | 内部 | 芯片温度传感器 |
| ADC1_IN17 | 内部 | 内部参考电压 1.2V |

内部通道 16/17 不用接引脚，但采样时间要给够（温度传感器要求 ≥17.1μs），否则读数不准。

## 三、单通道：电位器读值

```c
#include "stm32f10x.h"

void AD_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    ADC_InitTypeDef ADC_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_ADC1, ENABLE);
    RCC_ADCCLKConfig(RCC_PCLK2_Div6);            // 72MHz / 6 = 12MHz ≤ 14MHz

    /* ① 引脚：必须是模拟输入（数字部分关掉） */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_AIN;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_0;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② ADC 基本参数 */
    ADC_InitStructure.ADC_Mode               = ADC_Mode_Independent;
    ADC_InitStructure.ADC_ScanConvMode       = DISABLE;     // 单通道
    ADC_InitStructure.ADC_ContinuousConvMode = DISABLE;     // 单次
    ADC_InitStructure.ADC_ExternalTrigConv   = ADC_ExternalTrigConv_None;
    ADC_InitStructure.ADC_DataAlign          = ADC_DataAlign_Right;
    ADC_InitStructure.ADC_NbrOfChannel       = 1;
    ADC_Init(ADC1, &ADC_InitStructure);

    /* ③ 规则组通道 + 采样时间 */
    ADC_RegularChannelConfig(ADC1, ADC_Channel_0, 1, ADC_SampleTime_55Cycles5);

    /* ④ 校准：上电必须做一次，否则偏差几十个 LSB */
    ADC_Cmd(ADC1, ENABLE);
    ADC_ResetCalibration(ADC1);
    while(ADC_GetResetCalibrationStatus(ADC1));
    ADC_StartCalibration(ADC1);
    while(ADC_GetCalibrationStatus(ADC1));
}

/* 读一次电压（mV） */
uint16_t AD_GetValue(void)
{
    ADC_SoftwareStartConvCmd(ADC1, ENABLE);                 // 软件触发一次
    while(!ADC_GetFlagStatus(ADC1, ADC_FLAG_EOC));          // 等转换完成
    return ADC_GetConversionValue(ADC1);                    // 0~4095
}

/* 换算成毫伏：value * 3300 / 4096 */
uint16_t AD_To_mV(uint16_t value)
{
    return (uint16_t)((uint32_t)value * 3300 / 4096);
}
```

`(uint32_t)value * 3300` 这一步必须强制转 32 位：4095 × 3300 = 13,513,500，超过 16 位上限 65535，不转会溢出成一个乱数。这是 ADC 代码里最常见的 bug，而且**在低压时看起来是对的**（数值小不溢出），电压一高就跳变。

## 四、多通道：扫描 + 轮流读

多通道有两条路：

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 轮流切换 + 单次转换 | 每次 `ADC_RegularChannelConfig` 换通道再启动 | 代码直观、想读哪路读哪路 | 每次都要重配，速度慢 |
| 扫描 + DMA | 规则组排好 4 个通道，DMA 自动搬到数组 | 快、不占 CPU | 需要 DMA（第 12 课） |

先看不用 DMA 的版本：

```c
uint16_t AD_Read(uint8_t ch)
{
    ADC_RegularChannelConfig(ADC1, ch, 1, ADC_SampleTime_55Cycles5);
    ADC_SoftwareStartConvCmd(ADC1, ENABLE);
    while(!ADC_GetFlagStatus(ADC1, ADC_FLAG_EOC));
    return ADC_GetConversionValue(ADC1);
}

/* 依次读 4 路 */
void AD_Read4(uint16_t *out)
{
    out[0] = AD_Read(ADC_Channel_0);   // PA0
    out[1] = AD_Read(ADC_Channel_1);   // PA1
    out[2] = AD_Read(ADC_Channel_2);   // PA2
    out[3] = AD_Read(ADC_Channel_3);   // PA3
}
```

切换通道后第一次转换的读数往往偏高或偏低，因为采样保持电容还残留着上一路的电压。做法是**丢弃切换后的第一次读数**，或者把采样时间加长（55.5 或 239.5 周期），给电容足够的充电时间。

## 五、坑：读数总是 0、总是 4095、跳来跳去

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 读数恒为 0 | 引脚配成了 `GPIO_Mode_IPU/IPD`（数字输入），模拟通路没打开 | 必须是 `GPIO_Mode_AIN` |
| 读数恒为 4095 | 输入电压超过 3.3V（比如误接 5V 传感器） | 加分压电阻；ADC 引脚绝对不能超过 VDDA |
| 读数跳 ±20 LSB | 没做校准，或参考电压不稳 | 上电做一次校准；VDDA 加 100nF + 10μF |
| 多通道串扰 | 切换太急，采样电容没充够 | 加长采样时间，或丢弃第一次读数 |
| 电压高时数值乱跳 | `value * 3300` 用 16 位算了，溢出 | 强制转 `uint32_t` 再乘 |

:::warn ADC 引脚不要接 5V
ADC 输入范围是 0 到 VDDA（3.3V）。接 5V 会通过内部保护二极管灌电流，轻则读数失真，重则永久损坏这个通道。
读 5V 信号要么用电阻分压（两个 10kΩ 各一半），要么用外部运放做衰减。传感器模块标「5V 供电」不代表输出是 5V——先量一次再接线。
:::

## 六、采样时间怎么选

采样时间决定「采样保持电容充电多久」，选得越长越准，但转换越慢：

| 采样时间 | 总转换时间（12.5 周期固定开销） | 适合的信号源 |
| --- | --- | --- |
| 1.5 周期 | 约 1.17μs | 低阻抗（运放输出） |
| 7.5 周期 | 约 1.67μs | 一般传感器 |
| 55.5 周期 | 约 5.67μs | 高阻抗（电位器、光敏电阻，常见） |
| 239.5 周期 | 约 21μs | 极高阻抗、需要极稳 |

电位器动辄 10kΩ 以上，属于高阻抗源，直接用 1.5 周期会读到偏低的电压。**课程里的电位器、光敏电阻统一用 55.5 周期**，这是「读数莫名其妙偏低」的常见解法。

## 练习
Q| 12 位 ADC、3.3V 参考，读数为 2048 时输入电压是多少？如果读数只有 1，代表多少毫伏？
A| 2048 × 3.3 / 4096 = 1.65V（正好是量程中点）。
A| 读数 1 → 1 × 3.3 / 4096 ≈ 0.806mV。注意 0.806mV 是「1 个 LSB 的理论值」，实际能分辨的最小变化还要考虑噪声，通常有效位数（ENOB）只有 10 位左右。
Q| 电位器接 PA0，程序里把 PA0 配成了 `GPIO_Mode_IPU`，读数会怎样？
A| 读数基本恒为 4095（或接近满量程）。上拉输入把引脚通过 40kΩ 接到 3.3V，同时数字输入通路打开、模拟通路没开，ADC 采到的是被上拉钳住的电平。
A| 正确配置是 `GPIO_Mode_AIN`：关闭数字部分（省电、避免干扰），把引脚直接连到采样开关。凡是 ADC 读数「不随输入变化」，先查这一行。
Q| 用 `uint16_t mv = value * 3300 / 4096;` 计算毫伏，为什么电压一高就得到乱数？
A| `value` 是 `uint16_t`，`value * 3300` 仍在 16 位里算（整型提升到 `int` 时其实是 32 位，但如果写的是 `uint16_t mv = value * 3300 / 4096`，中间结果 13,513,500 超出 16 位，赋值时被截断）。
A| 稳妥写法：`uint16_t mv = (uint16_t)((uint32_t)value * 3300 / 4096);`——先转 32 位再乘，最后截回 16 位（结果最大 3300，不会溢出）。
Q| 依次读 PA0–PA3 四路电压，发现每一路都比实际值偏高一点，且通道之间互相影响。怎么改？
A| 典型的采样电容残留：切换通道后第一次转换，采样保持电容里还有上一路的电荷。
A| 两个改法：① 把采样时间从 1.5 周期加到 55.5 周期，让电容充分充放电；② 每次切换通道后先转换一次并丢弃结果，再取第二次的值。前者简单，后者更准。
