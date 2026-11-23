# 18 · I2C 与 OLED / MPU6050

part: 第五篇 · 总线与数据通路
video: P114 – P116 · P144 – P151
level: 进阶
lead: I2C 只用两根线就能挂一串器件，是传感器、EEPROM、OLED 的默认总线。它的难点不在协议，而在「开漏 + 上拉 + 时序 + 地址」这四件事同时要对。这一课把 I2C 时序讲清，再用 OLED 和 MPU6050 两个真实器件跑通硬件 I2C。

goals:
- 能画出 I2C 的起始、地址、ACK、数据、停止时序，说清「线与」与上拉的作用
- 能用 `HAL_I2C_Master_Transmit/Receive` 与 `Mem_Write/Mem_Read` 读写寄存器型器件
- 能初始化 SSD1306 OLED 并显示字符，能读 MPU6050 的 WHO_AM_I 与加速度
- 能处理总线锁死、地址错误、上拉不足这三类常见故障

stats: 2 根线 · 1 个 7 位地址 · 2 个实战器件

## 一、I2C 时序：两根线怎么说话

```
SCL ─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─
     └─┘ └─┘ └─┘ └─┘ └─┘
SDA ──┬───┬───┬───┬───┬───
      S   A6  A5 ...  P
```

- **起始（S）**：SCL 高时 SDA 由高变低；
- **地址**：7 位地址 + 1 位读写位（0 写、1 读）；
- **ACK**：第 9 个时钟，从机把 SDA 拉低表示收到；
- **数据**：每 8 位 + 1 位 ACK，高位在前；
- **停止（P）**：SCL 高时 SDA 由低变高。

关键电气特性：

- SDA/SCL 都是 **开漏**，必须外接上拉（常用 4.7kΩ；速率高/线长时 2.2kΩ）；
- 多器件挂同一总线，靠地址区分；地址冲突（同型号多片）要用地址脚改地址或加 I2C 多路复用器；
- 标准模式 100kHz、快速模式 400kHz；F1 的 I2C 支持到 400kHz。

## 二、HAL 的 I2C API

| 函数 | 用途 | 典型场景 |
|---|---|---|
| `HAL_I2C_Master_Transmit(&hi2c1, addr, buf, len, timeout)` | 写一段数据 | 发命令、写显存 |
| `HAL_I2C_Master_Receive(&hi2c1, addr, buf, len, timeout)` | 读一段数据 | 读传感器 |
| `HAL_I2C_Mem_Write(&hi2c1, addr, reg, regsize, buf, len, timeout)` | 写寄存器 | MPU6050 配置 |
| `HAL_I2C_Mem_Read(&hi2c1, addr, reg, regsize, buf, len, timeout)` | 读寄存器 | 读加速度/WHO_AM_I |
| `HAL_I2C_IsDeviceReady(&hi2c1, addr, trials, timeout)` | 探测器件 | 上电自检 |
| `HAL_I2C_Master_Transmit_IT/DMA` | 中断/DMA 版 | 大量数据 |

> 地址参数是 **8 位写地址**（7 位地址左移 1 位）。MPU6050 的 7 位地址是 0x68，HAL 里传 `0x68 << 1 = 0xD0`；读时 HAL 会自动把最低位置 1。

## 三、CubeMX 配置 I2C1

1. **Connectivity → I2C1 → I2C**；
2. Parameter Settings：Speed Mode = Fast Mode，Clock Speed = 400000；
3. 引脚图确认 **PB6=SCL、PB7=SDA**（F1 默认）；
4. 生成后 `i2c.c` 里有 `MX_I2C1_Init()`，GPIO 自动配成 **AF Open-Drain**；
5. 外部必须接 4.7kΩ 上拉到 3.3V（很多模块自带）。

## 四、实战 1：OLED（SSD1306）

### 初始化序列

SSD1306 上电后要按顺序发命令（0x00 表示命令流，0x40 表示数据流）：

```c
static void OLED_WriteCmd(uint8_t cmd)
{
    HAL_I2C_Mem_Write(&hi2c1, OLED_ADDR, 0x00, I2C_MEMADD_SIZE_8BIT, &cmd, 1, 100);
}

static void OLED_Init(void)
{
    static const uint8_t cmds[] = {
        0xAE,        /* 关显示 */
        0xD5, 0x80,  /* 时钟分频 */
        0xA8, 0x3F,  /* 复用率 1/64 */
        0xD3, 0x00,  /* 显示偏移 */
        0x40,        /* 起始行 */
        0x8D, 0x14,  /* 电荷泵开（关键！漏了全黑） */
        0x20, 0x00,  /* 水平寻址 */
        0xA1,        /* 段重映射 */
        0xC8,        /* 扫描方向 */
        0xDA, 0x12,  /* COM 引脚配置 */
        0x81, 0xCF,  /* 对比度 */
        0xD9, 0xF1,  /* 预充电 */
        0xDB, 0x40,  /* VCOMH */
        0xA4,        /* 显示显存 */
        0xA6,        /* 正常显示 */
        0xAF         /* 开显示 */
    };
    for (uint8_t i = 0; i < sizeof(cmds); i++) OLED_WriteCmd(cmds[i]);
}
```

### 写显存

SSD1306 是页寻址：8 页 × 128 列，每字节一列 8 个像素（低位在上）：

```c
void OLED_SetPos(uint8_t page, uint8_t col)
{
    OLED_WriteCmd(0xB0 + page);              /* 页地址 0–7 */
    OLED_WriteCmd(0x00 + (col & 0x0F));      /* 列低 4 位 */
    OLED_WriteCmd(0x10 + (col >> 4));        /* 列高 4 位 */
}

void OLED_WriteData(const uint8_t *buf, uint16_t len)
{
    HAL_I2C_Mem_Write(&hi2c1, OLED_ADDR, 0x40, I2C_MEMADD_SIZE_8BIT,
                      (uint8_t *)buf, len, 100);
}
```

字模、清屏、显示字符串都是「设位置 + 写数据」，完整字库可以沿用标准库课的取模结果。

## 五、实战 2：MPU6050

### 上电初始化

```c
#define MPU_ADDR   (0x68 << 1)

uint8_t who = 0;

/* 1. 读 WHO_AM_I（寄存器 0x75，应为 0x68） */
HAL_I2C_Mem_Read(&hi2c1, MPU_ADDR, 0x75, I2C_MEMADD_SIZE_8BIT, &who, 1, 100);

/* 2. 唤醒：PWR_MGMT_1(0x6B) 写 0x01，选 PLL 时钟 */
uint8_t val = 0x01;
HAL_I2C_Mem_Write(&hi2c1, MPU_ADDR, 0x6B, I2C_MEMADD_SIZE_8BIT, &val, 1, 100);

/* 3. 采样率分频、量程：SMPLRT_DIV(0x19)=9、ACCEL_CONFIG(0x1C)=0x00(±2g) */
val = 9;  HAL_I2C_Mem_Write(&hi2c1, MPU_ADDR, 0x19, I2C_MEMADD_SIZE_8BIT, &val, 1, 100);
val = 0;  HAL_I2C_Mem_Write(&hi2c1, MPU_ADDR, 0x1C, I2C_MEMADD_SIZE_8BIT, &val, 1, 100);
```

### 读加速度（6 字节，大端）

```c
uint8_t raw[6];
HAL_I2C_Mem_Read(&hi2c1, MPU_ADDR, 0x3B, I2C_MEMADD_SIZE_8BIT, raw, 6, 100);

int16_t ax = (int16_t)((raw[0] << 8) | raw[1]);
int16_t ay = (int16_t)((raw[2] << 8) | raw[3]);
int16_t az = (int16_t)((raw[4] << 8) | raw[5]);

/* ±2g 量程：16384 LSB/g */
printf("ax=%.3fg ay=%.3fg az=%.3fg\r\n",
       ax / 16384.0f, ay / 16384.0f, az / 16384.0f);
```

> MPU6050 上电默认睡眠，不写 `0x6B=0x01` 读出来全是 0——这是新手最常见的「数据全 0」原因。

## 六、坑：I2C 不通/总线锁死

| 现象 | 原因 | 修法 |
|---|---|---|
| `HAL_I2C_IsDeviceReady` 一直失败 | 上拉没接 / 地址错 / 器件没供电 | 量 SDA/SCL 空闲应为高；确认 8 位地址 |
| OLED 全黑 | 漏了电荷泵 `0x8D 0x14` | 补初始化序列 |
| 读 MPU6050 全 0 | 还在睡眠 / 地址错 | 写 `0x6B=0x01`，读 `WHO_AM_I=0x68` |
| 总线卡死（SDA 一直低） | 从机在传输中被复位，钳住 SDA | 手动发 9 个 SCL 脉冲 + 停止，或重新上电 |
| 偶尔 NACK | 上拉太大/线太长/速率太高 | 减小上拉、降速到 100kHz |
| 多器件地址冲突 | 同型号地址固定 | 改地址脚或加 TCA9548A |

## 练习

Q| MPU6050 的 7 位地址是 0x68，为什么 HAL 里要传 `0x68 << 1`？读和写时这个值有什么不同？
A| HAL 的地址参数是 8 位格式：高 7 位是器件地址，最低位是读写位。`0x68 << 1 = 0xD0` 是最低位为 0 的写地址；HAL 在接收函数里会自动把最低位置 1（0xD1）表示读。直接传 0x68 会被当成 8 位地址 0x68（7 位地址 0x34），从机不响应。

Q| I2C 的 SDA/SCL 为什么必须开漏并加上拉？如果误配成推挽，可能出现什么现象？
A| I2C 是多器件「线与」总线，任何器件只能拉低、释放时高阻，高电平由上拉提供。推挽输出会主动驱动高电平，当另一个器件拉低时形成电源到地的低阻通路，电流过大可能损坏器件；同时「线与」逻辑被破坏，仲裁失败。典型现象是通信偶发失败、波形高电平被拉低、器件发热。

Q| 写一个 I2C 寄存器型器件（如 MPU6050 的 0x6B）用哪个函数？它内部的时序与 `Master_Transmit` 有什么不同？
A| 用 `HAL_I2C_Mem_Write(&hi2c, addr, reg, I2C_MEMADD_SIZE_8BIT, buf, len, timeout)`。它先发起始 + 地址（写），再发寄存器地址，然后发数据，最后停止；`Master_Transmit` 只发地址 + 一段数据，不会自动插入寄存器地址。`Mem_Read` 则是「写寄存器地址 → 重复起始 → 读数据」，靠重复起始避免中途释放总线。

Q| 总线被从机钳住（SDA 一直低）时，为什么重新初始化 I2C 外设没用？正确的恢复步骤是什么？
A| 因为从机停在传输中间，仍握着 SDA；重新初始化只复位了主机状态机，从机没收到时钟，不会释放。恢复：把 SCL 配成普通开漏输出，手动发最多 9 个时钟脉冲，让从机把剩余位发完并释放 SDA；然后发一个停止条件（SCL 高时 SDA 低→高）；最后重新初始化 I2C。若仍无效，只能给从机断电复位。