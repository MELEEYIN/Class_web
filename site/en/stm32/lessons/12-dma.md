# 12 · DMA：让数据自己搬家
part: 第四篇 · 模拟与数据通路
video: P23 – P24 · DMA 直接存储器存取 / DMA 数据转运、DMA + AD 多通道
level: 难点
lead: 逐字节搬运数据是 CPU 最不值得干的活。DMA 是总线上的一个「搬运工」：你告诉它从哪搬到哪、搬多少，它就在后台自己搬，搬完给你一个标志。CPU 从「搬箱子的人」变成「下指令的人」。
goals:
- 能说清「外设地址 / 内存地址 / 传输方向 / 数据宽度 / 地址自增 / 传输数量」六个参数的含义
- 能用 DMA 做一次内存到内存的转运，并验证结果
- 能配出「ADC 扫描 + DMA 循环」，让 4 路电压自动刷新到数组里
- 记住 DMA 通道与请求的固定对应关系，知道为什么通道不能乱选
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、六个参数说清一次搬运

| 参数 | 库里对应的成员 | 含义 | 常见取值 |
| --- | --- | --- | --- |
| 外设地址 | `DMA_PeripheralBaseAddr` | 搬的一端（外设寄存器） | `(uint32_t)&ADC1->DR` |
| 内存地址 | `DMA_MemoryBaseAddr` | 另一端（SRAM 数组） | `(uint32_t)buffer` |
| 方向 | `DMA_DIR` | 外设→内存 / 内存→外设 | `DMA_DIR_PeripheralSRC`（外设是源） |
| 传输数量 | `DMA_BufferSize` | 搬多少个数据单元 | 4（4 个通道） |
| 地址自增 | `DMA_PeripheralInc` / `DMA_MemoryInc` | 每搬一次地址加不加 | 外设不自增，内存自增 |
| 数据宽度 | `DMA_PeripheralDataSize` / `DMA_MemoryDataSize` | 8/16/32 位 | `DMA_MemoryDataSize_HalfWord` |

「外设地址不自增、内存地址自增」是最常用的组合：外设这边永远是同一个数据寄存器（`ADC1->DR`），内存那边从 `buf[0]` 一路写到 `buf[3]`。

数据宽度必须两边一致。ADC 是 12 位、寄存器 16 位，所以两边都设 `HalfWord`；设成 `Byte` 会把 16 位拆成两次，读出来的值全是错的。

## 二、通道是固定的：查表，别猜

DMA1 有 7 个通道，每个通道能响应哪些请求是**硬件焊死**的，不能自由分配：

| 通道 | 可响应的请求（部分） | 常用场景 |
| --- | --- | --- |
| DMA1_Channel1 | **ADC1**、TIM2_CH3、TIM4_CH1 | ADC 采集（本课主角） |
| DMA1_Channel2 | SPI1_RX、USART3_TX、TIM1_CH1、TIM2_UP | 串口/SPI 接收 |
| DMA1_Channel3 | SPI1_TX、USART3_RX、TIM1_CH2 | SPI 发送 |
| DMA1_Channel4 | SPI2_RX、**USART1_TX**、I2C2_TX | 串口 1 发送（printf 加速） |
| DMA1_Channel5 | SPI2_TX、**USART1_RX**、I2C2_RX | 串口 1 接收（不定长收包） |
| DMA1_Channel6 | USART2_RX、I2C1_TX、TIM1_CH3 | 串口 2 接收 |
| DMA1_Channel7 | USART2_TX、I2C1_RX、TIM2_CH2 | 串口 2 发送 |

所以「ADC1 用 DMA」只能是 **DMA1_Channel1**。选错通道程序不会报错，就是永远不搬——这类 bug 最难查，因为所有配置看起来都「对」。

## 三、内存到内存：先验证搬运本身

学习 DMA 建议先做一次「SRAM → SRAM」的转运，不牵扯外设，最容易验证：

```c
#include "stm32f10x.h"

uint8_t  SrcBuf[4] = {0x01, 0x02, 0x03, 0x04};
uint8_t  DstBuf[4] = {0};

void MyDMA_Init(uint32_t src, uint32_t dst, uint16_t size)
{
    DMA_InitTypeDef DMA_InitStructure;

    RCC_AHBPeriphClockCmd(RCC_AHBPeriph_DMA1, ENABLE);   // DMA 挂在 AHB 上

    DMA_InitStructure.DMA_PeripheralBaseAddr = src;
    DMA_InitStructure.DMA_MemoryBaseAddr     = dst;
    DMA_InitStructure.DMA_DIR                = DMA_DIR_PeripheralSRC;
    DMA_InitStructure.DMA_BufferSize         = size;
    DMA_InitStructure.DMA_PeripheralInc      = DMA_PeripheralInc_Enable;  // 内存→内存：两端都自增
    DMA_InitStructure.DMA_MemoryInc          = DMA_MemoryInc_Enable;
    DMA_InitStructure.DMA_PeripheralDataSize = DMA_PeripheralDataSize_Byte;
    DMA_InitStructure.DMA_MemoryDataSize     = DMA_MemoryDataSize_Byte;
    DMA_InitStructure.DMA_Mode               = DMA_Mode_Normal;           // 只搬一次
    DMA_InitStructure.DMA_Priority           = DMA_Priority_Medium;
    DMA_InitStructure.DMA_M2M                = DMA_M2M_Enable;            // 软件触发
    DMA_Init(DMA1_Channel1, &DMA_InitStructure);

    DMA_Cmd(DMA1_Channel1, ENABLE);
}

/* 启动一次转运并等它完成 */
void MyDMA_Transfer(uint16_t size)
{
    DMA_Cmd(DMA1_Channel1, DISABLE);          // ① 改数量前必须先关
    DMA_SetCurrDataCounter(DMA1_Channel1, size);
    DMA_Cmd(DMA1_Channel1, ENABLE);           // ② 重新使能即开始

    while(DMA_GetFlagStatus(DMA1_FLAG_TC1) == RESET);   // ③ 等传输完成
    DMA_ClearFlag(DMA1_FLAG_TC1);                       // ④ 清标志
}
```

四个动作的顺序不能乱：**关 → 改数量 → 开 → 等标志 → 清标志**。改 `BufferSize` 时通道必须是关闭的，否则新值不生效。

## 四、ADC + DMA：四路电压自动刷新

这是 DMA 在单片机里最典型、也最有用的用法：ADC 按规则组顺序扫 4 个通道，每转换完一个，DMA 就把它搬进数组。CPU 完全不参与。

```c
uint16_t AD_Value[4];        // 必须放全局！放局部会被栈回收

void AD_DMA_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    ADC_InitTypeDef ADC_InitStructure;
    DMA_InitTypeDef DMA_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_ADC1, ENABLE);
    RCC_AHBPeriphClockCmd(RCC_AHBPeriph_DMA1, ENABLE);
    RCC_ADCCLKConfig(RCC_PCLK2_Div6);                 // 12MHz

    /* ① 4 个引脚全部模拟输入 */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_AIN;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_0 | GPIO_Pin_1 | GPIO_Pin_2 | GPIO_Pin_3;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② DMA：外设 ADC1->DR → 内存数组，循环模式 */
    DMA_InitStructure.DMA_PeripheralBaseAddr = (uint32_t)&ADC1->DR;
    DMA_InitStructure.DMA_MemoryBaseAddr     = (uint32_t)AD_Value;
    DMA_InitStructure.DMA_DIR                = DMA_DIR_PeripheralSRC;
    DMA_InitStructure.DMA_BufferSize         = 4;
    DMA_InitStructure.DMA_PeripheralInc      = DMA_PeripheralInc_Disable;
    DMA_InitStructure.DMA_MemoryInc          = DMA_MemoryInc_Enable;
    DMA_InitStructure.DMA_PeripheralDataSize = DMA_PeripheralDataSize_HalfWord;
    DMA_InitStructure.DMA_MemoryDataSize     = DMA_MemoryDataSize_HalfWord;
    DMA_InitStructure.DMA_Mode               = DMA_Mode_Circular;   // 循环，永不停
    DMA_InitStructure.DMA_Priority           = DMA_Priority_High;
    DMA_InitStructure.DMA_M2M                = DMA_M2M_Disable;
    DMA_Init(DMA1_Channel1, &DMA_InitStructure);
    DMA_Cmd(DMA1_Channel1, ENABLE);

    /* ③ ADC：扫描 + 连续 + 4 个通道 */
    ADC_InitStructure.ADC_Mode               = ADC_Mode_Independent;
    ADC_InitStructure.ADC_ScanConvMode       = ENABLE;      // 扫描
    ADC_InitStructure.ADC_ContinuousConvMode = ENABLE;      // 连续
    ADC_InitStructure.ADC_ExternalTrigConv   = ADC_ExternalTrigConv_None;
    ADC_InitStructure.ADC_DataAlign          = ADC_DataAlign_Right;
    ADC_InitStructure.ADC_NbrOfChannel       = 4;
    ADC_Init(ADC1, &ADC_InitStructure);

    ADC_RegularChannelConfig(ADC1, ADC_Channel_0, 1, ADC_SampleTime_55Cycles5);
    ADC_RegularChannelConfig(ADC1, ADC_Channel_1, 2, ADC_SampleTime_55Cycles5);
    ADC_RegularChannelConfig(ADC1, ADC_Channel_2, 3, ADC_SampleTime_55Cycles5);
    ADC_RegularChannelConfig(ADC1, ADC_Channel_3, 4, ADC_SampleTime_55Cycles5);

    ADC_DMACmd(ADC1, ENABLE);          // ④ 让 ADC 转换完发 DMA 请求
    ADC_Cmd(ADC1, ENABLE);
    ADC_ResetCalibration(ADC1);
    while(ADC_GetResetCalibrationStatus(ADC1));
    ADC_StartCalibration(ADC1);
    while(ADC_GetCalibrationStatus(ADC1));

    ADC_SoftwareStartConvCmd(ADC1, ENABLE);   // ⑤ 启动一次，之后就自动循环
}
```

之后主循环里什么都不用做，`AD_Value[0..3]` 会一直是最新的四路电压。

## 五、坑：不搬、搬一半、值不对

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 数组一直是 0 | 通道选错（比如 ADC 用了 Channel2） | ADC1 只能用 DMA1_Channel1 |
| 只搬了一次就停 | 用了 `DMA_Mode_Normal` | 连续采集要 `DMA_Mode_Circular` |
| 数组前几个对、后面乱 | `BufferSize` 和实际通道数不一致 | 4 个通道就填 4 |
| 数据跳动很大 | 数据宽度设成 Byte，16 位值被拆开 | 两边都用 `HalfWord` |
| 程序偶尔跑飞 | 数组定义在函数内（栈上），函数返回后被复用 | 改成全局变量或 `static` |
| 改了电压值不更新 | 忘了 `ADC_DMACmd(ADC1, ENABLE)` | ADC 不产生 DMA 请求，DMA 就空等 |

:::warn 全局数组不是「好习惯」，是硬要求
DMA 在后台按地址搬运，它不知道「这个数组是谁的」。如果数组是某个函数的局部变量，函数返回后这块栈空间会被别的变量覆盖，DMA 就把数据写进了别人的地盘——表现是「数值随机、程序偶发跑飞」。
凡是给 DMA 用的缓冲区，一律定义为全局或 `static`，并加注释说明「DMA 目标，勿移出全局」。
:::

## 六、DMA 还能省下哪些 CPU

| 场景 | 不用 DMA | 用 DMA | 收益 |
| --- | --- | --- | --- |
| 4 路 ADC 连续采集 | 每次中断读一次，10kHz 采样就是 10k 次中断 | 0 次中断 | CPU 占用从 30% 降到 1% |
| 串口发送 1KB 数据 | 循环等 TXE，阻塞几毫秒 | 一次配置，后台发 | 主循环不被阻塞 |
| 串口不定长接收 | 每字节中断 + 拼包 | DMA 循环 + 空闲中断 | 高波特率不丢字节 |
| OLED 刷整屏 | 逐字节 I2C 发送 | 硬件 I2C + DMA | 刷新时间减半 |

代价是「调试变难」：数据是后台写的，你打断点看不到搬运过程。所以每次用 DMA，先做一次内存到内存的验证，确认配置无误再接外设。

## 练习
Q| ADC 采集 4 路电压用 DMA，为什么必须配成 `DMA_Mode_Circular` 而不是 `Normal`？
A| `Normal` 模式搬完 `BufferSize` 个数据就停止，需要软件重新使能才会再搬。ADC 连续转换时，第二次转换的数据就没人搬了，数组会停在第一批值上。
A| `Circular` 模式搬完自动重置计数器，永远循环，正好匹配「ADC 一直转、DMA 一直搬」的连续采集场景。单次采集（比如按一下键读一次）才用 `Normal`。
Q| `DMA_InitStructure.DMA_PeripheralInc` 为什么设成 `Disable`，而 `DMA_MemoryInc` 设成 `Enable`？
A| 因为外设端永远是同一个寄存器 `ADC1->DR`：4 个通道的数据都从这一个地址读出，地址不能变。设成 Enable 会让它去读 `DR+2`、`DR+4`，那些地址不是 ADC 数据寄存器，读回来是垃圾。
A| 内存端要依次写 `AD_Value[0]`、`[1]`、`[2]`、`[3]`，所以必须自增。这个「外设不动、内存动」的组合是外设→内存传输的标准配置。
Q| 把 `AD_Value[4]` 定义在 `AD_DMA_Init()` 函数内部，会发生什么？
A| 函数返回后，这块栈空间被释放，可能被其他函数的局部变量覆盖。DMA 仍在往里写，就写到了别人的数据上。
A| 现象：读数偶尔正确、偶尔是奇怪的数；严重时覆盖返回地址导致程序跑飞（HardFault）。修法是把缓冲区定义为全局数组或 `static`，并在注释里标明用途。
Q| 用 DMA 搬 1000 字节，`BufferSize` 填 1000，但发现只搬了 500 个就停了。可能是什么原因？
A| 最常见的是数据宽度设成了 `HalfWord`（16 位）：`BufferSize` 的单位是「数据单元」而不是字节。1000 个 HalfWord 需要 2000 字节的缓冲区，如果实际缓冲区只有 1000 字节，后半段就写越界了。
A| 另一种可能：`BufferSize` 是 16 位寄存器，最大 65535，超过要分批。先确认「单元数 × 单元字节数 = 实际缓冲区大小」，再查方向与自增配置。
