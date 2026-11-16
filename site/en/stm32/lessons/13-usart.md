# 13 · USART 串口：收发、数据包与串口下载
part: 第五篇 · 通信总线
video: P25 – P30 · 串口协议 / 串口外设 / 发送与接收 / 数据包 / 串口下载
level: 进阶
lead: 串口是「没有时钟线的通信」：双方事先约好速度（波特率），然后一位一位地发。没有时钟线省了两根线，代价是双方的计时必须足够准，差一点点就会把 0 读成 1。
goals:
- 能画出串口一帧的位序，说清起始位、校验位、停止位各自防的是什么错
- 能手算 BRR 寄存器值，解释为什么 9600 波特率在 72MHz 下是 0x1D4C
- 能用中断接收 + 状态机解析一个「包头 + 数据 + 校验」的数据包
- 知道没有 ST-Link 时怎么用 FlyMcu 经串口下载程序
stats: 7 个小节 · 4 张表 · 4 道练习

## 一、一帧数据长什么样

串口（UART）在没有数据时线保持高电平（空闲态）。发一个字节的过程是：

| 顺序 | 内容 | 说明 |
| --- | --- | --- |
| 1 | 起始位（0） | 从高变低，告诉对方「要开始了」 |
| 2–9 | 8 个数据位 | **低位在前（LSB first）**，先发 bit0 |
| 10 | 校验位（可选） | 奇校验/偶校验/无 |
| 11 | 停止位（1） | 拉高，长度可 1 / 1.5 / 2 位 |

「低位在前」这一点最容易记错：发 `0x01` 时，线上是先 1 后 7 个 0。用逻辑分析仪看波形时如果读出来是 `0x80`，就是这个位序搞反了。

起始位的作用是**帧同步**：接收方在空闲时一直等一个下降沿，一旦看到就启动自己的采样时钟。所以只要每帧都能重新对齐，双方波特率的微小误差就不会累积——这也是异步串口能工作的根本原因。

## 二、波特率：一个除法和一个小数

波特率 = 每秒传多少位。STM32 的波特率由 `USART_BRR` 决定：

**USARTDIV = fCK / (16 × 波特率)**

fCK 对 USART1 是 PCLK2 = 72MHz，对 USART2/3 是 PCLK1 = 36MHz。以 72MHz、9600 为例：

| 步骤 | 计算 | 结果 |
| --- | --- | --- |
| 除法 | 72,000,000 / (16 × 9600) | 468.75 |
| 整数部分（mantissa） | 468 | 0x1D4 |
| 小数部分 × 16 | 0.75 × 16 = 12 | 0xC |
| BRR | 0x1D4C | 468.75 |

所以 9600 在 72MHz 下的 `BRR` 是 `0x1D4C`。实际误差约 0.02%，可以忽略。作为对照，115200 时 `USARTDIV = 39.0625`，小数部分只能取 1/16 的倍数（0.0625 正好等于 1/16），误差也几乎为零——这两个波特率是「天生准」的，所以最常用。

:::warn 波特率对不上，第一个字节一定是乱码
接收方按自己的时钟采样，两边差 3% 以上就会在某一位采错。典型现象是：发 "Hello" 收到 "H€llo" 或一堆 `?`。
排查顺序：① 两边波特率是不是一样（注意有些模块默认 115200）；② USART2/3 用的是 PCLK1 = 36MHz，别按 72MHz 算；③ 有没有奇偶校验不一致（8N1 是最常见的组合）。
:::

## 三、单字节收发：先把线打通

```c
#include "stm32f10x.h"
#include <stdio.h>

void Serial_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    USART_InitTypeDef USART_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1 | RCC_APB2Periph_GPIOA, ENABLE);

    /* ① TX：复用推挽（输出交给外设）；RX：上拉输入 */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_9;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_10;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② 参数：9600、8 位数据、无校验、1 停止位、只收不发？不，收发都要 */
    USART_InitStructure.USART_BaudRate            = 9600;
    USART_InitStructure.USART_WordLength          = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits            = USART_StopBits_1;
    USART_InitStructure.USART_Parity              = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode                = USART_Mode_Tx | USART_Mode_Rx;
    USART_Init(USART1, &USART_InitStructure);

    USART_Cmd(USART1, ENABLE);
}

void Serial_SendByte(uint8_t byte)
{
    USART_SendData(USART1, byte);
    while(USART_GetFlagStatus(USART1, USART_FLAG_TXE) == RESET);   // 等发送寄存器空
}

void Serial_SendString(char *str)
{
    while(*str){
        Serial_SendByte(*str++);
    }
}
```

`while(TXE == RESET)` 这一句不能省：`USART_SendData` 只是把字节放进发送数据寄存器（TDR），硬件还要把它移到移位寄存器一位位发出去。不等 TXE 就连续调用，后一个字节会覆盖前一个。

想让 `printf` 也走串口，重定向 `fputc` 即可：

```c
/* 重定向 printf 到 USART1；Keil 里要勾 Use MicroLIB */
int fputc(int ch, FILE *f)
{
    Serial_SendByte(ch);
    return ch;
}

/* 用法：printf("voltage = %d mV\r\n", mv); 注意用 \r\n，串口助手才换行 */
```

## 四、中断接收：不要在主循环里死等

轮询接收（`while(RXNE == RESET)`）会把主循环卡住。正确做法是中断接收，把收到的字节放进缓冲区：

```c
uint8_t RxData;                  // 最近收到的字节
uint8_t RxFlag = 0;

void Serial_RxIRQ_Init(void)
{
    NVIC_InitTypeDef NVIC_InitStructure;

    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);   // 接收寄存器非空中断

    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

void USART1_IRQHandler(void)
{
    if(USART_GetITStatus(USART1, USART_IT_RXNE) == SET){
        RxData = USART_ReceiveData(USART1);          // 读 DR 会自动清标志
        RxFlag = 1;
        /* 这里绝对不要 printf —— 见下文「坑」 */
    }
}
```

读 `DR` 会自动清除 RXNE 标志，所以这个中断里不需要手动清。但如果开了溢出错误中断（ORE），就必须手动清，否则会卡在中断里反复进。

## 五、数据包：从「收字节」到「收一条消息」

单字节只能传命令，传不了「一组数据」。要传结构化的信息，得自己定一个包格式：

| 方案 | 格式 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 定长包 | `0xFF` + 4 字节数据 + 校验和 | 解析简单 | 数据长度固定 |
| 变长包（HEX） | `0xFF` + `len` + `data[len]` + `sum` | 灵活 | 要做状态机 |
| 文本包 | `@data#` 或 `data\r\n` | 人可读，串口助手能直接看 | 效率低、要处理转义 |

变长 HEX 包的状态机是这类代码的标准答案：

```c
/* 收到的字节喂进来，凑齐一包返回 1 */
uint8_t Packet_Parse(uint8_t byte, uint8_t *out, uint8_t *len)
{
    static uint8_t state = 0, idx = 0, sum = 0, n = 0;

    switch(state){
    case 0:                                  /* 等包头 */
        if(byte == 0xFF){ state = 1; }
        break;
    case 1:                                  /* 收长度 */
        n = byte;
        if(n == 0 || n > 32){ state = 0; break; }
        idx = 0; sum = 0; state = 2;
        break;
    case 2:                                  /* 收数据 */
        out[idx++] = byte;
        sum += byte;
        if(idx >= n){ state = 3; }
        break;
    case 3:                                  /* 校验 */
        state = 0;
        if(byte == sum){ *len = n; return 1; }
        break;
    }
    return 0;
}
```

这个状态机的价值不在代码本身，而在思路：**每个字节都可能让状态前进或回到起点，任何时候都不会「卡住等」**。串口数据随时可能丢字节、被干扰，一个会死等的解析函数（比如「等到收满 5 个字节」）会让整个接收通路永久瘫痪。

## 六、串口下载：没有 ST-Link 时的救命通道

BOOT0 = 1、BOOT1 = 0 时芯片从「系统存储器」启动，跑的是 ST 出厂固化的 Bootloader，它监听 USART1（PA9/PA10）。于是可以这样下载：

1. 把 BOOT0 跳线接到 1，按一下复位。
2. USB 转 TTL 接 PA9（TX→RX）、PA10（RX→TX）、GND 共地。**TX/RX 必须交叉**。
3. 打开 FlyMcu，选串口和波特率（115200 或 76800），选生成的 `.hex` 文件，勾「编程前重装文件」，点开始。
4. 下载完成后把 BOOT0 接回 0，再复位一次，程序才从头跑。

| 常见报错 | 原因 |
| --- | --- |
| 一直「连接中」/ 读不到芯片 | TX/RX 没交叉、没共地、BOOT0 没接 1、波特率太高 |
| 能连上但一写就失败 | 芯片开了读保护，先用 ST-Link Utility 解除 |
| 下载完不运行 | BOOT0 还在 1，芯片每次复位都进 Bootloader |

## 七、坑：乱码、丢包、中断里 printf

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 全是乱码 | 波特率/校验位不一致；USART2 用了 72MHz 算 | 核对两边参数与总线频率 |
| 只收到第一个字节 | 没等 TXE 就连发；或接收端没及时读 DR 导致溢出 | 加 `while(TXE)`；接收用中断 |
| 偶发丢一大段 | 中断里做了耗时操作（`printf`、`Delay`） | 中断只存字节，解析放主循环 |
| 发中文全是问号 | 串口助手编码不是 UTF-8 | 助手切 UTF-8，或只发 ASCII |
| 收到自己的数据（回环） | TX 和 RX 短接了，或接错到同一个脚 | 检查杜邦线 |

:::tip 为什么中断里不能 printf
`printf` 最终会调到 `fputc` → `Serial_SendByte` → `while(TXE == RESET)`。9600 波特率发 1 个字节要 1.04ms，发 20 个字符就是 20ms。
USART 只有一个字节的接收缓冲，这 20ms 里来的数据全部丢失——而且是在「你正在调试的接收中断里」丢的，最容易误导排查方向。
:::

## 练习
Q| 72MHz 下要配 115200 波特率，USARTDIV 是多少？BRR 怎么填？
A| USARTDIV = 72,000,000 / (16 × 115200) = 39.0625。整数部分 39 = 0x27，小数部分 0.0625 × 16 = 1，所以 BRR = 0x271。
A| 误差为 0（0.0625 正好是 1/16 的整数倍）。这就是 115200 在 72MHz 下特别准的原因；换成 100000 就有约 0.16% 误差，长帧可能出错。
Q| 串口收到的数据偶尔整段丢失，而且都是在「程序刚打印完调试信息」之后。最可能的原因？
A| 在接收中断里调用了 `printf`（或主循环长时间阻塞），导致 RXNE 溢出。USART 只有一个字节的接收缓冲，下一个字节到来时上一个还没读走，就会置 ORE 溢出标志、丢掉新数据。
A| 修法：中断里只把字节存进环形缓冲区并置标志，解析和打印都放到主循环。规范做法是「中断搬数据，主循环做业务」。
Q| 自定义的 HEX 包用「包头 0xFF + 长度 + 数据 + 校验和」，为什么必须校验和？
A| 串口在电气干扰、长线、共地不良时会翻转个别位。没有校验，一个 0x01 被干扰成 0x02，接收方会当成合法数据执行。
A| 校验和只能发现错误、不能纠正。工程上更稳的做法是 CRC16 + 超时重发；学习阶段用「累加和」足够，但一定要有——它是「数据可信」和「数据不可信」的分界线。
Q| 用 FlyMcu 下载程序，一直提示连接不上芯片，可能漏了哪一步？
A| 最常见的是 BOOT0 没接 1（此时芯片跑的是用户程序，不是 Bootloader），或者 TX/RX 没交叉接（TX 接 TX 是接不通的）。
A| 其次检查共地和波特率：波特率先降到 9600 试；有些 USB-TTL 模块的 3.3V 输出带不动板子，要单独给板子供电（只接 TX/RX/GND 三根线）。
