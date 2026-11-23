# 11 · HAL 串口收发与中断回调

part: 第三篇 · 串口通信
video: P70 – P75
level: 基础
lead: HAL 把串口拆成三种用法：阻塞、中断、DMA。阻塞最简单但会卡住 CPU；中断适合低速命令；DMA 适合大量数据。这一课把三种写法都跑一遍，再解决「不定长数据怎么收」这个最实际的问题——上位机发来的命令可不会刚好 8 个字节。

goals:
- 能默写 `HAL_UART_Transmit/Receive` 与 `_IT`、`_DMA` 版本的区别和适用场景
- 能重写 `HAL_UART_RxCpltCallback()`，实现「收到就回显」
- 能用「空闲中断 + DMA」接收不定长数据包
- 能处理溢出、帧错误与重新挂接收这三类常见问题

stats: 3 种收发方式 · 2 个回调 · 1 套不定长方案

## 一、三种收发方式

| 方式 | 函数 | 特点 | 适用 |
|---|---|---|---|
| 阻塞 | `HAL_UART_Transmit/Receive` | 死等，超时参数控制 | 初始化打印、少量数据 |
| 中断 | `HAL_UART_Transmit_IT/Receive_IT` | 每字节进中断，函数立即返回 | 命令、按键式交互 |
| DMA | `HAL_UART_Transmit_DMA/Receive_DMA` | 硬件搬，CPU 不参与 | 大量数据、高频采样 |

```c
/* 阻塞发送：3 秒超时 */
HAL_UART_Transmit(&huart1, (uint8_t *)"hello\r\n", 7, 3000);

/* 中断发送：发完进 TxCpltCallback */
HAL_UART_Transmit_IT(&huart1, buf, len);

/* DMA 发送：发完进 TxCpltCallback（DMA 完成） */
HAL_UART_Transmit_DMA(&huart1, buf, len);
```

### 中断接收必须「重新挂」

`HAL_UART_Receive_IT(&huart1, &rx, 1)` 只收 **1 个字节**，收完就停。要连续收，必须在回调里再挂一次：

```c
uint8_t rx_byte;

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        if (rx_byte == '\r') {
            /* 命令结束 */
        }
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);   /* 重新挂，别忘 */
    }
}
```

忘了重新挂，现象是「只能收第一个字节」。

## 二、CubeMX 配置

1. USART1：Asynchronous、115200-8-N-1；
2. **NVIC Settings** 勾 `USART1 global interrupt`；
3. 如果要用 DMA：**DMA Settings → Add → USART1_RX / USART1_TX**，Mode 选 Normal（接收不定长）或 Circular（连续采集）；
4. 生成后在 `main.c` 调 `HAL_UART_Receive_IT` 或 `HAL_UART_Receive_DMA` 启动。

## 三、实战 1：收到什么回什么

```c
/* USER CODE BEGIN PV */
uint8_t rx_byte;
/* USER CODE END PV */

/* USER CODE BEGIN 2 */
HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
/* USER CODE END 2 */

/* USER CODE BEGIN 4 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        HAL_UART_Transmit_IT(&huart1, &rx_byte, 1);   /* 回显 */
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);    /* 继续收 */
    }
}
/* USER CODE END 4 */
```

> 回显用 `Transmit_IT` 而不是阻塞版，避免在中断里等发送完成。发送期间又收到字节也没关系：接收和发送是两条独立通路，HAL 内部有状态机，但同一方向不要在上一次没完成时重复启动。

## 四、实战 2：不定长数据——空闲中断 + DMA

### 思路

DMA 把串口数据连续搬到缓冲区；一帧数据发完，总线会空闲，触发 **IDLE 中断**；在 IDLE 回调里算出「这次收了多少字节」，交给主循环解析，然后重新启动 DMA。

```c
#define RX_SIZE 128
uint8_t  rx_buf[RX_SIZE];
uint16_t rx_len = 0;
volatile uint8_t rx_flag = 0;

/* 启动：DMA 接收 + 开空闲中断 */
void UART_StartRx(void)
{
    HAL_UART_Receive_DMA(&huart1, rx_buf, RX_SIZE);
    __HAL_UART_ENABLE_IT(&huart1, UART_IT_IDLE);
}

/* 空闲中断处理：HAL 没有现成回调，需要自己判 */
void USART1_IRQHandler(void)
{
    HAL_UART_IRQHandler(&huart1);

    if (__HAL_UART_GET_FLAG(&huart1, UART_FLAG_IDLE)) {
        __HAL_UART_CLEAR_IDLEFLAG(&huart1);

        /* 停 DMA，读剩余计数算出已收字节数 */
        HAL_UART_DMAStop(&huart1);
        rx_len = RX_SIZE - __HAL_DMA_GET_COUNTER(huart1.hdmarx);
        rx_flag = 1;

        HAL_UART_Receive_DMA(&huart1, rx_buf, RX_SIZE);  /* 重新挂 */
        __HAL_UART_ENABLE_IT(&huart1, UART_IT_IDLE);
    }
}

/* 主循环解析 */
if (rx_flag) {
    rx_flag = 0;
    rx_buf[rx_len] = '\0';          /* 预留 1 字节给结束符 */
    printf("recv %u bytes: %s\r\n", rx_len, rx_buf);
}
```

### 要点

- 缓冲区留 1 字节给 `'\0'`，`RX_SIZE-1` 更安全；
- `HAL_UART_DMAStop()` 会同时关收发，若还要发，改用 `HAL_UART_AbortReceive()` 或只停 RX 流；
- IDLE 标志清除必须用 `__HAL_UART_CLEAR_IDLEFLAG`（读 SR 再读 DR 的序列），普通清标志不行；
- 数据量大时用双缓冲/环形 DMA，避免解析期间新数据覆盖。

## 五、回调与错误处理

| 回调 | 时机 | 用途 |
|---|---|---|
| `HAL_UART_TxCpltCallback` | 发送完成 | 释放缓冲区、发下一包 |
| `HAL_UART_RxCpltCallback` | 收到指定长度 | 处理数据、重新挂接收 |
| `HAL_UART_ErrorCallback` | ORE/NE/FE/PE | 清错误、重启接收 |
| `HAL_UART_AbortCallback` | 中止完成 | 清理状态 |

错误回调里至少要做两件事：读 `huart->ErrorCode` 记录原因，重新启动接收；否则一次溢出后可能再也收不到。

```c
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        __HAL_UART_CLEAR_OREFLAG(huart);
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);   /* 恢复 */
    }
}
```

## 六、坑：串口能发不能收 / 收几个就停

| 现象 | 原因 | 修法 |
|---|---|---|
| 只收第一个字节 | 回调里没重新 `Receive_IT` | 重新挂接收 |
| 收到乱码 | 波特率/时钟/接线 | 查 PCLK2、HSE、TX-RX 交叉 |
| 发着发着卡住 | 上次发送没完成又启动 | 等 `TxCpltCallback` 或查 `gState` |
| DMA 只搬一次 | DMA 模式选了 Normal | 连续接收改 Circular，或每次重启 |
| IDLE 不进 | 没使能 IDLE 中断 / 没清标志 | `__HAL_UART_ENABLE_IT` + 正确清标志 |
| 溢出后收不到 | ORE 没清、接收没重启 | `ErrorCallback` 里恢复 |

## 练习

Q| `HAL_UART_Transmit`、`HAL_UART_Transmit_IT`、`HAL_UART_Transmit_DMA` 三者的返回时机有什么不同？分别在什么场景用？
A| 阻塞版在数据全部发完（或超时）才返回，期间 CPU 空转；中断版把缓冲区地址交给外设后立即返回，每发一个字节进一次中断，全部发完调 `TxCpltCallback`；DMA 版也是立即返回，但由 DMA 控制器搬运，CPU 完全不参与，完成时进回调。初始化打印/少量调试用阻塞；中等长度、要并行处理用中断；大批量、高吞吐用 DMA。

Q| 为什么 `HAL_UART_Receive_IT(&huart1, &rx, 1)` 只能收一个字节？要连续接收有哪几种改法？
A| 因为 HAL 的接收状态机把「接收长度」作为一次传输的参数，收满指定长度就结束并回调，不会自动续传。改法：① 在 `RxCpltCallback` 里再次调用 `Receive_IT`（最常用）；② 一次挂一个较大缓冲区，收满再处理（定长协议）；③ 用 DMA + IDLE 做不定长；④ 用 DMA Circular 模式持续搬运，主循环按写指针取数据。

Q| 「空闲中断 + DMA」方案里，`rx_len = RX_SIZE - __HAL_DMA_GET_COUNTER(...)` 的含义是什么？为什么必须先停 DMA？
A| DMA 的计数器从设定长度开始递减，剩余计数 = 还没搬的字节数，所以「总长度 − 剩余」就是本次已收字节数。先停 DMA 是为了冻结计数器和缓冲区：如果不停，CPU 读计数与后续数据到达之间存在竞争，算出的长度可能偏大/偏小，且重新启动 DMA 会重置计数器。停完再算、再重启，得到的是稳定的一帧长度。

Q| 串口中断里调用 `printf` 会有什么问题？如果调试时确实想在中端里打日志，应该怎么设计？
A| `printf` 内部走阻塞发送，一个几十字节的字符串要几毫秒；期间同优先级/低优先级中断被挂起，串口接收可能溢出，系统实时性崩坏。更糟的是 `printf` 不可重入，主循环和中断同时调用会破坏内部状态。正确设计：中断里只把日志写入环形缓冲区（或只置事件），主循环/DMA 负责真正发送；或者用 `HAL_UART_Transmit_IT` 发到独立缓冲，绝不在中断里等。