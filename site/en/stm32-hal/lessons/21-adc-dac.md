# 21 · ADC 与 DAC

part: 第五篇 · 总线与数据通路
video: P137 – P143
level: 进阶
lead: ADC 把电压变成数字，是单片机感知模拟世界的入口；DAC 反过来，把数字变成电压。F103C8 有 2 个 12 位 ADC、没有 DAC，这一课用 ADC 做电压采集与 DMA 连续采样，再讲清 DAC 在 F1 上的替代方案（换型号或 PWM + RC 滤波）。

goals:
- 能说清 ADC 的通道、采样时间、转换模式与校准流程
- 能算出 12 位 ADC 的电压换算与分辨率，知道参考电压的影响
- 能用 CubeMX + HAL 配出单次采样与 DMA 连续采样
- 知道 C8T6 没有 DAC，能用 PWM + RC 或换型号实现模拟输出

stats: 12 位 · 2 个 ADC · 1 条换算公式

## 一、ADC 的输入通路

```
引脚（模拟输入） ─► 采样开关 ─► 采样电容 ─► 逐次逼近 ─► 数据寄存器 DR
                          ▲
                    采样时间（SMP）
```

| 概念 | 含义 | 影响 |
|---|---|---|
| 分辨率 | 12 位，0–4095 | 3.3V 参考时约 0.8mV/LSB |
| 参考电压 | VREF+（通常 3.3V） | 读数 = Vin/VREF × 4096 |
| 采样时间 | 采样电容充电时间 | 信号源内阻大要加长 |
| 转换时间 | 采样 + 12.5 个 ADC 周期 | 最快 1µs 左右（14MHz） |
| 校准 | 上电后校准一次 | 不校准有几十 LSB 偏差 |

**ADC 时钟 ≤ 14MHz**：72MHz 经 ADC 预分频 ÷6 = 12MHz。超了读数会乱。

### 通道映射

| 通道 | 引脚 | 通道 | 引脚 |
|---|---|---|---|
| ADC1_IN0 | PA0 | ADC1_IN4 | PA4 |
| ADC1_IN1 | PA1 | ADC1_IN5 | PA5 |
| ADC1_IN2 | PA2 | ADC1_IN6 | PA6 |
| ADC1_IN3 | PA3 | ADC1_IN7 | PA7 |

还有内部通道：温度传感器（IN16）、VREFINT（IN17）。用内部通道要单独使能并加采样时间。

## 二、CubeMX 配置 ADC1

1. **Analog → ADC1**：勾一个输入通道（如 IN0 → PA0）；
2. Parameter Settings：
   - Mode = Independent
   - Clock Prescaler = ÷6
   - Resolution = 12 bits
   - Scan Conversion Mode = Disabled（单通道）/ Enabled（多通道）
   - Continuous Conversion Mode = Disabled（单次）/ Enabled（连续）
   - Discontinuous = Disabled
   - Data Alignment = Right
3. **Rank**：把通道加到规则组，设置采样时间（如 71.5 cycles）；
4. 要 DMA 就去 **DMA Settings** 加 DMA1_Channel1（第 20 课）；
5. 生成后 `adc.c` 有 `MX_ADC1_Init()`，PA0 自动配成模拟输入。

## 三、单次采样：轮询

```c
uint16_t adc_raw;
float voltage;

HAL_ADC_Start(&hadc1);                              /* 启动一次转换 */
if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    adc_raw = HAL_ADC_GetValue(&hadc1);
    voltage = adc_raw * 3.3f / 4096.0f;             /* 12 位 */
}
HAL_ADC_Stop(&hadc1);
```

`PollForConversion` 会等 EOC 标志，超时返回 `HAL_TIMEOUT`。单次采样适合低速率、简单场景。

## 四、连续采样：DMA + 循环

```c
#define N 128
uint16_t adc_buf[N];

/* CubeMX 里 ADC 连续模式 + DMA Circular */
HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_buf, N);

/* 半完成/完成回调里处理 */
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    if (hadc->Instance == ADC1) {
        uint32_t sum = 0;
        for (int i = 0; i < N; i++) sum += adc_buf[i];
        uint16_t avg = sum / N;
        printf("avg=%u  %.3fV\r\n", avg, avg * 3.3f / 4096.0f);
    }
}
```

> 求平均时 `sum` 用 `uint32_t`，否则 128×4095 会溢出 16 位。电压换算先乘 3.3（浮点）再除 4096，避免整数除法丢精度。

## 五、多通道扫描

扫描模式下 ADC 按 Rank 顺序转换多个通道，DMA 把结果依次放入数组：

```
Rank1: IN0 → buf[0]
Rank2: IN1 → buf[1]
Rank3: IN2 → buf[2]
```

CubeMX 里把 Scan Conversion 打开，Rank 里添加通道并设采样时间；DMA 长度 = 通道数 × 采样轮数。注意每个通道的采样时间可以不同：高内阻信号给更长采样。

## 六、DAC：C8T6 没有，怎么办

F103C8T6 **没有 DAC**。三条路：

| 方案 | 做法 | 优缺点 |
|---|---|---|
| 换型号 | F103RC/ZE 等带 DAC 的型号 | 最直接，硬件改板 |
| PWM + RC 滤波 | PWM 输出 → RC 低通 → 模拟电压 | 便宜，纹波/响应速度受限 |
| 外部 DAC | SPI/I2C 的 MCP4725、DAC8552 | 精度高，多一颗芯片 |

### PWM + RC 示例

PWM 1kHz、RC 截止频率约 100Hz（R=1kΩ、C=1µF）：

```
Vout ≈ 3.3V × 占空比
```

纹波与 RC 时间常数成反比；要更低纹波就加大 RC，但响应变慢。适合 LED 调光、基准电压这类对速度要求不高的场合。

## 七、坑：ADC 读数不对

| 现象 | 原因 | 修法 |
|---|---|---|
| 恒为 4095 | 引脚没配模拟 / 输入超 3.3V | 配 `GPIO_MODE_ANALOG`，分压 |
| 恒为 0 | 通道选错 / 没启动转换 | 查 Rank，`HAL_ADC_Start` |
| 读数乱跳 | 采样时间太短 / 信号源内阻大 / 电源噪声 | 加长采样，加 0.1µF，参考源去耦 |
| 误差几十 LSB | 没校准 | 上电 `HAL_ADCEx_Calibration_Start` |
| 多通道数据错位 | DMA 长度/顺序不对 | 长度 = 通道数 × 轮数，按 Rank 顺序读 |
| 电压算出来翻倍 | 整数溢出 / 参考电压不是 3.3V | 用 `uint32_t`，量 VREF |

## 练习

Q| 12 位 ADC、VREF=3.3V，读到 2048 时电压是多少？分辨率是多少？如果 VREF 实际是 3.0V，同样的读数电压变成多少？
A| 2048/4096 × 3.3 = 1.65V；分辨率 = 3.3/4096 ≈ 0.806mV/LSB。VREF=3.0V 时 2048 对应 1.5V。读数只反映「占 VREF 的比例」，VREF 不准，电压就不准；要精确测量，用外部基准或先测 VREFINT 反算。

Q| 为什么 ADC 时钟不能超过 14MHz？72MHz 下应该怎么分频？
A| STM32F1 的 ADC 逐次逼近电路有最高时钟限制（数据手册规定 14MHz），超了转换结果不保证、可能明显偏差。72MHz 经 ADC 预分频 ÷6 = 12MHz，是最常用的配置；÷4 是 18MHz 超限，÷8 是 9MHz（更稳但慢）。

Q| 单次轮询采样与 DMA 连续采样各适合什么场景？为什么连续采样要用 Circular DMA？
A| 单次轮询适合「偶尔读一下」：按键按下才测电池电压、低功耗休眠前采样；实现简单但每次都要 CPU 等待。连续采样适合音频、电流环、传感器流：DMA Circular 自动循环覆盖缓冲区，CPU 只需在完成/半完成中断里处理，不会因为忘记重启而断流；Normal 模式搬完就停，需要频繁重启，容易丢数据。

Q| C8T6 想输出 0–3.3V 的可调电压，但没有 DAC，用 PWM+RC 时如何选择 PWM 频率与 RC 参数？
A| 先定纹波与响应：PWM 频率至少比 RC 截止频率高 10 倍以上（如 20kHz PWM、截止 200Hz），RC 时间常数 τ=RC 决定建立时间（约 5τ）。R 太小滤波不足、太大驱动能力差；常用 R=1kΩ、C=1µF（τ=1ms，纹波小但响应约 5ms）。要求快速响应就减小 RC、提高 PWM 频率；要求低纹波就加大 RC，代价是响应慢。