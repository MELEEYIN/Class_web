# 23 · 通信扩展：CAN · RS485 · 单总线 · 无线

part: 第六篇 · 系统与进阶
video: P156 – P168
level: 进阶
lead: 串口、I2C、SPI 之外，工业与消费产品还有几类常见链路：CAN 用在汽车/工控，RS485 用在长距离多机，单总线用一根线接传感器，红外/无线负责遥控与组网。这一课不展开每个协议的寄存器，而是把「物理层 → 帧格式 → HAL 用法 → 典型坑」讲清楚，让你拿到模块能上手。

goals:
- 能说清 CAN 的差分总线、帧格式、过滤器与波特率，能用 HAL 发一帧
- 能用 USART + DE 引脚做 RS485 半双工收发
- 能写出 DS18B20/DHT11 的单总线时序框架
- 知道红外 NEC 与 NRF24L01/ESP8266 的接入方式与选型

stats: 4 类链路 · 1 条差分总线 · 1 根单总线

## 一、CAN：差分总线上的多主通信

### 物理层

- **CAN_H / CAN_L** 差分信号，抗干扰强，适合汽车/工控；
- 两端各接 **120Ω 终端电阻**，否则反射导致误码；
- 速率与总线长度成反比：1Mbps 约 40m，125kbps 可到 500m；
- 需要 **CAN 收发器**（TJA1050/SN65HVD230），F1 的 CAN_TX/RX 是 TTL，不能直接上总线。

### 帧格式（标准帧）

```
SOF | 11 位 ID | RTR | IDE | DLC | 0–8 字节数据 | CRC | ACK | EOF
```

- **ID** 既标识内容也决定优先级（ID 越小优先级越高）；
- **DLC** 是数据长度（0–8）；
- 标准帧 11 位 ID，扩展帧 29 位。

### CubeMX + HAL

1. **Connectivity → CAN**：Master Mode；
2. Parameter Settings：Prescaler、Time Segments 按波特率算（如 72MHz、500kbps：Prescaler=9，BS1=4，BS2=3，SJW=1）；
3. 引脚：PA11=CAN_RX、PA12=CAN_TX（F1 默认）；
4. **NVIC** 勾 CAN RX0 中断（接收）。

```c
CAN_HandleTypeDef hcan;

/* 启动 */
HAL_CAN_Start(&hcan);
HAL_CAN_ActivateNotification(&hcan, CAN_IT_RX_FIFO0_MSG_PENDING);

/* 发送标准帧 */
CAN_TxHeaderTypeDef tx = {0};
uint8_t data[8] = {0x11, 0x22, 0x33};
uint32_t mailbox;

tx.StdId = 0x123;
tx.IDE   = CAN_ID_STD;
tx.RTR   = CAN_RTR_DATA;
tx.DLC   = 3;
HAL_CAN_AddTxMessage(&hcan, &tx, data, &mailbox);

/* 接收回调 */
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan)
{
    CAN_RxHeaderTypeDef rx;
    uint8_t buf[8];
    HAL_CAN_GetRxMessage(hcan, CAN_RX_FIFO0, &rx, buf);
    /* rx.StdId, rx.DLC, buf[] */
}
```

### 过滤器

CAN 默认过滤器可能全部拒收。要收所有标准帧，配一个掩码全 0 的过滤器：

```c
CAN_FilterTypeDef f = {0};
f.FilterBank = 0;
f.FilterMode = CAN_FILTERMODE_IDMASK;
f.FilterScale = CAN_FILTERSCALE_32BIT;
f.FilterIdHigh = 0x0000;
f.FilterIdLow = 0x0000;
f.FilterMaskIdHigh = 0x0000;   /* 全 0：全部通过 */
f.FilterMaskIdLow = 0x0000;
f.FilterFIFOAssignment = CAN_RX_FIFO0;
f.FilterActivation = ENABLE;
HAL_CAN_ConfigFilter(&hcan, &f);
```

## 二、RS485：半双工的长距离串口

RS485 是「差分版串口」：A/B 两线、半双工、可挂 32 个节点、最长 1200m。需要一个收发器（MAX485/SP3485），并控制 **DE/RE** 引脚：

```
发送：DE=1（驱动总线）→ UART 发完 → 等 TC → DE=0（释放）
接收：DE=0（高阻接收）
```

```c
#define RS485_DE_HIGH()  HAL_GPIO_WritePin(DE_GPIO_Port, DE_Pin, GPIO_PIN_SET)
#define RS485_DE_LOW()   HAL_GPIO_WritePin(DE_GPIO_Port, DE_Pin, GPIO_PIN_RESET)

void RS485_Send(uint8_t *buf, uint16_t len)
{
    RS485_DE_HIGH();
    HAL_UART_Transmit(&huart2, buf, len, 100);   /* 阻塞发完 */
    while (__HAL_UART_GET_FLAG(&huart2, UART_FLAG_TC) == RESET) { }  /* 等最后一位 */
    RS485_DE_LOW();
}
```

- 发送后必须等 `TC`（发送完成）再释放总线，否则最后几个字节被截断；
- 接收端在空闲时保持 DE=0；
- 总线两端加 120Ω 终端电阻，必要时加偏置电阻。

## 三、单总线：DS18B20 / DHT11

单总线用一根线（外加 GND/电源）完成双向通信，靠「主机拉低不同时长」表示 0/1，对时序要求到微秒级。

### DS18B20 流程

```
复位（拉低 480µs → 释放 → 等 15–60µs 存在脉冲）
→ 跳过 ROM（0xCC）
→ 启动转换（0x44）→ 等待 750ms
→ 复位 → 跳过 ROM → 读暂存器（0xBE）→ 读 9 字节
```

```c
/* 微秒延时用 DWT（第 05 课） */
static void ow_reset(void)
{
    OW_LOW();  DWT_Delay_us(480);
    OW_RELEASE(); DWT_Delay_us(60);
    /* 读存在脉冲：应为低 */
    DWT_Delay_us(420);
}

static void ow_write_bit(uint8_t b)
{
    OW_LOW();
    if (b) { DWT_Delay_us(6); OW_RELEASE(); DWT_Delay_us(64); }
    else   { DWT_Delay_us(60); OW_RELEASE(); DWT_Delay_us(10); }
}
```

DS18B20 必须用 **开漏 + 4.7kΩ 上拉**，且时序不能被打断；读的时候要关中断或保证中断极短。DHT11 的时序更宽松（毫秒级），但协议不同，不能混用。

## 四、红外与无线

| 链路 | 典型器件 | 接口 | 要点 |
|---|---|---|---|
| 红外遥控 | HS0038 接收头 | GPIO + 定时器捕获 | NEC 协议：9ms 引导 + 4.5ms 间隔 + 32 位；用捕获测脉宽 |
| 2.4G 无线 | NRF24L01 | SPI + CE/IRQ | 配置寄存器多，先读 STATUS 确认通信 |
| WiFi | ESP8266/ESP32 | USART AT 指令 | 波特率 115200，AT 固件；注意 3.3V 供电电流 |
| 蓝牙 | HC-05/06 | USART | 透传模式，配对后当串口用 |

红外的难点是「解码」而不是硬件；无线的难点是「电源与天线布局」——NRF24L01 对 3.3V 供电纹波敏感，ESP8266 峰值电流可达 300mA，不能从 STM32 的 3.3V 稳压器直接取。

## 五、坑：扩展通信的典型故障

| 现象 | 原因 | 修法 |
|---|---|---|
| CAN 一帧都收不到 | 没配过滤器 / 没接收发器 / 无终端电阻 | 配全通过过滤器，量 CAN_H/L 差分 |
| CAN 错误帧暴涨 | 波特率不一致 / 终端电阻缺失 | 两端 120Ω，采样点一致 |
| RS485 最后字节丢失 | 没等 TC 就释放 DE | 发完等 `UART_FLAG_TC` |
| RS485 只能单向 | DE 一直为低 / A/B 接反 | 发送时拉高 DE，交换 A/B 试 |
| DS18B20 读 85℃ | 转换没完成就读 / 时序错 | 等 750ms，用 DWT 精确延时 |
| 单总线偶尔成功 | 中断打断时序 | 读写字期间关中断，或临界区 |
| NRF24L01 不通 | 供电不足/SPI 模式错 | 独立 3.3V，模式 0，先读 STATUS |

## 练习

Q| CAN 总线为什么需要 120Ω 终端电阻？只在一边接会怎样？
A| CAN 是差分总线，信号在电缆末端会反射；120Ω 终端电阻与电缆特性阻抗匹配，吸收反射能量。只在一边接，另一端仍有反射，表现为波形过冲/振铃，高速或长线时误码率升高、通信不稳定。标准做法是总线物理两端各接一个 120Ω。

Q| RS485 发送完为什么必须等 `TC` 标志再拉低 DE？只等 `TXE` 会怎样？
A| `TXE` 表示数据寄存器空、可以写下一个字节，但移位寄存器里可能还有最后一位没发完；此时拉低 DE 会释放总线，最后 1–2 位被截断，接收端收到错误帧。`TC` 表示「最后一个停止位也发完了」，此时释放才安全。用中断/DMA 发送时，要在 `TxCpltCallback` 里释放 DE。

Q| DS18B20 读回 85℃ 说明什么？为什么单总线时序里要避免长中断？
A| 85℃ 是 DS18B20 上电默认值，说明「启动转换后没等够 750ms 就读」，或者根本没转换成功。单总线的 0/1 靠微秒级高低电平宽度区分，中断打断会让主机拉低/释放的时间错位，从机解析成别的位；所以读写期间要关中断或用极短的临界区，微秒延时用 DWT 而不是 `HAL_Delay`。

Q| 用 ESP8266 通过 AT 指令联网，硬件上最容易忽略的两点是什么？
A| ① 供电：ESP8266 峰值电流可达 300mA，STM32 板上的 3.3V LDO 通常带不动，必须独立 3.3V/500mA 电源并共地；② 电平与串口：ESP8266 是 3.3V，可直接接 STM32 的 USART，但要用交叉接（TX→RX），并且 AT 固件默认波特率可能是 115200 或 74880，先确认。还要留出 EN/GPIO0 的上拉，否则不启动。