# 20 · DMA：让数据自己搬家

part: 第五篇 · 总线与数据通路
video: P135 – P136
level: 进阶
lead: CPU 搬数据很贵：一个字节一次读、一次写，还要占总线。DMA 是独立的搬运工，你告诉它「从哪搬到哪、搬多少」，它自己完成，CPU 只在搬完时收一个中断。ADC 连续采样、串口大量收发、SPI 刷屏，靠的都是 DMA。

goals:
- 能画出 DMA 的请求 → 通道 → 源/目的地址 → 传输完成的通路
- 能说清 Normal/Circular、单次/突发、增量模式的区别
- 能用 CubeMX + HAL 配出 ADC + DMA 与 UART + DMA 两条典型链
- 能用计数器算出「已搬多少」，能做双缓冲/环形接收

stats: 2 个 DMA 控制器 · 7 个通道 · 1 个计数器

## 一、DMA 控制器里有什么

F1 有 DMA1（7 通道）和 DMA2（5 通道，F103C8 上 DMA2 部分可用）：

```
外设请求（ADC1 / USART1_TX / SPI1_RX …）
        │
        ▼
   ┌──────────┐   源地址 ──► 数据宽度/增量 ──► 目的地址
   │  DMA 通道 │───► 每次传输搬 1 字节/半字/字
   └──────────┘   ◄── 传输计数 CNDTR
        │
        └─► 传输完成/半完成/错误 → 中断
```

| 配置项 | 含义 | 常见取值 |
|---|---|---|
| Direction | 外设→内存 / 内存→外设 / 内存→内存 | ADC→RAM、RAM→UART |
| Mode | Normal 搬完停 / Circular 循环 | 单次采集 Normal，连续采集 Circular |
| Data Width | 源/目的各 8/16/32 位 | ADC 用 Half Word |
| Increment | 地址是否递增 | 内存地址递增，外设地址固定 |
| Priority | 通道优先级 | 高优先级给实时数据 |
| Channel | 请求映射到哪个通道 | 查参考手册 DMA 请求映射表 |

**请求映射是硬连线**：ADC1 只能走 DMA1_Channel1，USART1_TX 走 DMA1_Channel4，USART1_RX 走 DMA1_Channel5。选错通道，DMA 永远等不到请求。

## 二、CubeMX 配置（以 ADC1 + DMA 为例）

1. 先把 **ADC1** 配好（第 21 课）；
2. **DMA Settings → Add**：
   - DMA1 Channel1
   - Direction: Peripheral To Memory
   - Priority: High
   - Mode: Circular（连续采集）
   - Data Width: Half Word / Half Word
   - Increment: 内存勾选，外设不勾
3. **NVIC** 里 DMA1_Channel1 中断会自动使能（用 `_IT` 时）；
4. 生成后 `adc.c` 里 `HAL_ADC_Start_DMA()` 的参数已经带好 `hdma_adc1`。

### 串口 DMA

- **USART1_TX**：DMA1_Channel4，Memory → Peripheral，Normal；
- **USART1_RX**：DMA1_Channel5，Peripheral → Memory，Circular（不定长接收常用）。

## 三、HAL 的 DMA API

```c
/* 底层：直接启动一个 DMA 流/通道 */
HAL_DMA_Start(&hdma_adc1, (uint32_t)&ADC1->DR, (uint32_t)buf, len);
HAL_DMA_Start_IT(&hdma_adc1, src, dst, len);       /* 完成时进回调 */
HAL_DMA_Abort(&hdma_adc1);

/* 外设层：通常不用直接碰 DMA */
HAL_ADC_Start_DMA(&hadc1, (uint32_t *)buf, len);
HAL_UART_Transmit_DMA(&huart1, buf, len);
HAL_UART_Receive_DMA(&huart1, buf, len);
HAL_SPI_TransmitReceive_DMA(&hspi1, tx, rx, len);
```

### 回调

```c
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    if (hadc->Instance == ADC1) {
        /* 一批数据搬完 */
    }
}

void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart) { /* 发完 */ }
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) { /* 收满 */ }
```

DMA 的底层回调是 `HAL_DMA_XferCpltCallback`，一般由外设驱动转成上面的外设回调，业务层不用直接注册。

### 读进度

```c
uint32_t done = len - __HAL_DMA_GET_COUNTER(&hdma_adc1);
```

计数器递减，`总长 − 剩余` 就是已搬字节数；配合 Circular 模式可以做「边采集边处理」。

## 四、实战：ADC 连续采样 + 串口发送

```c
#define N 256
uint16_t adc_buf[N];

/* 启动 */
HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_buf, N);

/* DMA 半完成/完成回调（需要开 Half Transfer 中断） */
void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc)
{
    /* 前半 [0, N/2) 已就绪，可处理 */
}
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    /* 后半 [N/2, N) 已就绪 */
}
```

双缓冲的常见做法：开 **Half Transfer + Transfer Complete** 两个中断，前半满时处理前半、后半满时处理后半，这样 CPU 处理与 DMA 搬运并行，不会覆盖未处理的数据。

## 五、DMA 与 Cache/一致性

F1 是 Cortex-M3，**没有 D-Cache**，所以不存在「DMA 写完 CPU 读到旧数据」的一致性问题，省了很多事。F7/H7 有 Cache，DMA 前后要做 `SCB_CleanDCache/InvalidateDCache`，这是换系列时要注意的差异。

## 六、坑：DMA 不动/只搬一次

| 现象 | 原因 | 修法 |
|---|---|---|
| 数据全是 0 | 通道选错 / 外设没开 DMA 请求 | 查请求映射，确认 `hdma_xxx` 绑定 |
| 只搬一次 | Mode=Normal | 连续采集改 Circular，或重新启动 |
| 地址错位 | 内存 Increment 没开 / 外设 Increment 开了 | 内存递增，外设固定 |
| 数据宽度不匹配 | ADC 12 位用 Byte | 用 Half Word |
| 完成回调不进 | 没开 DMA 中断 / 用了 `HAL_DMA_Start` 而非 `_IT` | 用 `_IT`，开 NVIC |
| 传输一半停了 | 优先级被抢 / 外设错误 | 查 DMA 错误标志，提高优先级 |
| 串口 DMA 发送卡住 | 上一次没完成又启动 | 等 `TxCpltCallback` 或查 `gState` |

## 练习

Q| DMA 的 Normal 与 Circular 模式有什么区别？ADC 连续采样和串口发一包数据分别该用哪个？
A| Normal：搬完设定数量就停止，需要重新启动；Circular：搬完自动回到起点继续，计数器重装。ADC 连续采样用 Circular（不断覆盖缓冲区，配半完成/完成中断处理）；串口发送一包固定数据用 Normal（发完即停，进回调发下一包）。串口不定长接收常用 Circular + IDLE。

Q| 为什么 ADC1 的 DMA 请求只能接到 DMA1_Channel1？如果接到 Channel2 会怎样？
A| 因为 F1 的 DMA 请求映射是硬件固定的：每个外设请求线只连到特定通道，ADC1 固定在 DMA1_Channel1。接到其他通道后，该通道收不到 ADC 的请求信号，DMA 不会启动，表现为「ADC 在转换但缓冲区不变」。选通道必须查参考手册的 DMA 请求映射表或让 CubeMX 自动分配。

Q| `__HAL_DMA_GET_COUNTER()` 返回什么？在 Circular 模式下它如何变化？怎么用它算「已处理到哪」？
A| 返回当前剩余待传输数量（CNDTR）。Circular 模式下每搬一个数减 1，减到 0 后自动重装为总长度并回卷。用「总长 − 剩余」得到自上次重装以来已搬的数量；因为会回卷，主循环要结合半完成/完成中断或维护自己的读指针，不能只靠一次读数判断绝对位置。

Q| 用 DMA 把 1KB 数据从内存发到串口，发送期间 CPU 能做什么？发送完成后怎么知道缓冲区可以复用了？
A| DMA 独立占用总线搬运，CPU 可以继续执行其他任务（取指会与 DMA 争总线，略有减速，但不阻塞）。发送完成后 DMA 触发中断，HAL 调用 `HAL_UART_TxCpltCallback()`；只有在这个回调里才能安全复用/释放该缓冲区。若在回调前改写，DMA 可能发出新旧混合的数据。