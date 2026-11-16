# 05 · OLED：用软件 I2C 驱动 SSD1306
part: 第二篇 · GPIO 与显示
video: P9 – P10 · OLED 调试工具 / OLED 显示屏
level: 基础
lead: OLED 不是「一个能写字的东西」，而是一块 128×64 的显存加一个扫描控制器。你要做的只有一件：把字节写到显存里正确的位置上，屏幕自己去扫。所以这一课真正的难点不是「显示」，是「怎么把那 1024 个字节送过去」——也就是软件 I2C 的时序。
goals:
- 能说清 SSD1306 的页结构，以及「一个字节管 8 个像素」是怎么回事
- 能徒手写出软件 I2C 的起始、停止、写字节、读应答四个函数
- 能初始化一块 0.96 寸 OLED，并显示字符、汉字、数字
- 遇到「花屏 / 全黑 / 乱码」时，知道分别先查哪里
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、显存：1024 个字节管 8192 个像素

0.96 寸 OLED 的控制器是 SSD1306，分辨率 128×64。它的显存（GDDRAM）按「页（page）」组织：**每页 8 行像素，共 8 页**，每页 128 列，每列 1 个字节。

| 概念 | 数值 | 关系 |
| --- | --- | --- |
| 屏幕像素 | 128 × 64 | 横向 128 列，纵向 64 行 |
| 页（page） | 8 页 | 每页 8 行 → 8 × 8 = 64 行 |
| 显存总量 | 128 × 8 = 1024 字节 | 每字节管一列上的 8 个像素 |
| 坐标写法 | (x, page) | x = 0–127，page = 0–7 |

一个字节的 8 个位，垂直排列：最低位在最上面。所以往 `(x=0, page=0)` 写 `0x01`，屏幕左上角第 1 个像素亮；写 `0xFF`，那一列的前 8 个像素全亮。**字号必须是 8 的倍数**（8×16、16×16 等），根源就在这里——一页正好 8 行，跨页就要拼两次。

:::tip 为什么 OLED 特别适合调试
单片机没有屏幕，`printf` 又要占串口。一块 OLED 只要两根 IO，能实时显示变量名和值，比反复烧程序看 LED 高效得多。课程里从第 05 课开始，几乎所有实验都用它显示状态。
:::

## 二、软件 I2C：四根线里的两根，靠 IO 模拟

硬件 I2C 外设（第 14 课）还没学，先用手动翻转 IO 的方式模拟 I2C 时序，好处是「时序全在你手里」，看得见、好调试。

接线（软件 I2C，套件默认）：

| OLED 引脚 | 接 STM32 | 配置 |
| --- | --- | --- |
| VCC | 3.3V | — |
| GND | GND | — |
| SCL | PB8 | 开漏输出（`GPIO_Mode_Out_OD`） |
| SDA | PB9 | 开漏输出（读应答时临时切输入） |

I2C 的四个基本动作，本质都是「拉低 / 释放」：

1. **起始（Start）**：SCL 高电平时，SDA 由高变低。
2. **停止（Stop）**：SCL 高电平时，SDA 由低变高。
3. **写一位**：SCL 低时改 SDA，然后 SCL 拉高让从机采样。
4. **应答（ACK）**：主机释放 SDA（切输入），发第 9 个时钟，读到 0 表示从机应答。

```c
#include "stm32f10x.h"
#include "Delay.h"

#define SCL_H  GPIO_SetBits(GPIOB, GPIO_Pin_8)
#define SCL_L  GPIO_ResetBits(GPIOB, GPIO_Pin_8)
#define SDA_H  GPIO_SetBits(GPIOB, GPIO_Pin_9)
#define SDA_L  GPIO_ResetBits(GPIOB, GPIO_Pin_9)
#define SDA_R  GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_9)

void MyI2C_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_OD;   // 开漏：只能拉低
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_8 | GPIO_Pin_9;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStructure);

    SCL_H; SDA_H;                                       // 空闲时都为高
}

void MyI2C_Start(void)
{
    SDA_H; SCL_H; Delay_us(2);
    SDA_L; Delay_us(2);                                 // SCL 高时 SDA 下降 = 起始
    SCL_L; Delay_us(2);
}

void MyI2C_Stop(void)
{
    SDA_L; SCL_H; Delay_us(2);
    SDA_H; Delay_us(2);                                 // SCL 高时 SDA 上升 = 停止
}

void MyI2C_SendByte(uint8_t byte)
{
    uint8_t i;
    for(i = 0; i < 8; i++){
        if(byte & 0x80) SDA_H; else SDA_L;              // 先发最高位
        byte <<= 1;
        Delay_us(2);
        SCL_H; Delay_us(2);
        SCL_L; Delay_us(2);
    }
}

uint8_t MyI2C_ReceiveAck(void)
{
    uint8_t ack;
    SDA_H; Delay_us(2);                                 // 释放 SDA，交给从机
    SCL_H; Delay_us(2);
    ack = SDA_R;                                        // 0 = 应答
    SCL_L; Delay_us(2);
    return ack;
}
```

开漏配置 + 没有外部上拉电阻时，`SDA_H` 只是「松手」，电平靠 OLED 模块板上的上拉电阻恢复——这也是为什么开漏必须配上拉。

## 三、命令和数据：同一个地址，两种字节

SSD1306 的从机地址是 7 位 `0x3C`，写成 8 位就是**写 0x78、读 0x79**。每次传输第一个字节是地址，第二个字节是**控制字节**，决定后面跟的是命令还是数据：

| 控制字节 | 含义 | 典型内容 |
| --- | --- | --- |
| `0x00` | 后面全是命令 | 初始化、设置坐标、开关显示 |
| `0x40` | 后面全是数据（写进显存） | 字模点阵 |

```c
void OLED_WriteCommand(uint8_t cmd)
{
    MyI2C_Start();
    MyI2C_SendByte(0x78);        // 从机地址 + 写
    MyI2C_ReceiveAck();
    MyI2C_SendByte(0x00);        // 控制字节：命令
    MyI2C_ReceiveAck();
    MyI2C_SendByte(cmd);
    MyI2C_ReceiveAck();
    MyI2C_Stop();
}

void OLED_WriteData(uint8_t *data, uint8_t count)
{
    uint8_t i;
    MyI2C_Start();
    MyI2C_SendByte(0x78);
    MyI2C_ReceiveAck();
    MyI2C_SendByte(0x40);        // 控制字节：数据
    MyI2C_ReceiveAck();
    for(i = 0; i < count; i++){
        MyI2C_SendByte(data[i]);
        MyI2C_ReceiveAck();
    }
    MyI2C_Stop();
}
```

一次 Start…Stop 里可以连续写多个字节，SSD1306 会自动把地址往后加。所以写一个 16×16 汉字（32 字节）只需要一次 Start，比「每字节一次 Start」快得多，也更稳。

## 四、初始化：一串固定命令

初始化不需要理解每一条，但要知道哪几条最关键：

```c
void OLED_Init(void)
{
    Delay_ms(100);                       // 上电后等电源稳定，否则可能白屏

    OLED_WriteCommand(0xAE);             // 关显示
    OLED_WriteCommand(0xD5); OLED_WriteCommand(0x80);   // 时钟分频
    OLED_WriteCommand(0xA8); OLED_WriteCommand(0x3F);   // 复用率 64 行
    OLED_WriteCommand(0xD3); OLED_WriteCommand(0x00);   // 显示偏移 0
    OLED_WriteCommand(0x40);             // 起始行 = 0
    OLED_WriteCommand(0xA1);             // 左右方向：正常（0xA0 为镜像）
    OLED_WriteCommand(0xC8);             // 上下方向：正常（0xC0 为翻转）
    OLED_WriteCommand(0xDA); OLED_WriteCommand(0x12);   // COM 引脚配置
    OLED_WriteCommand(0x81); OLED_WriteCommand(0xCF);   // 对比度
    OLED_WriteCommand(0xD9); OLED_WriteCommand(0xF1);   // 预充电周期
    OLED_WriteCommand(0xDB); OLED_WriteCommand(0x30);   // VCOMH
    OLED_WriteCommand(0xA4);             // 显示跟随显存
    OLED_WriteCommand(0xA6);             // 正常显示（0xA7 为反色）
    OLED_WriteCommand(0x8D); OLED_WriteCommand(0x14);   // 开电荷泵（不开不亮）
    OLED_WriteCommand(0xAF);             // 开显示

    OLED_Clear();
}
```

`0x8D 0x14` 这一条最容易被漏：不开电荷泵，屏幕有显存但**一点都不亮**，现象是「代码全对、屏幕全黑」。

## 五、写字：把字模铺到正确的位置

显示一个 8×16 的字符，要写 16 个字节：上半页 8 个（page p），下半页 8 个（page p+1）。先把光标定到 `(x, page)`：

```c
void OLED_SetCursor(uint8_t page, uint8_t x)
{
    OLED_WriteCommand(0xB0 | page);                 // 页地址 0~7
    OLED_WriteCommand(0x10 | (x & 0xF0) >> 4);      // 列地址高 4 位
    OLED_WriteCommand(0x00 | (x & 0x0F));           // 列地址低 4 位
}

/* 显示一个 8x16 的 ASCII 字符，x 为 0~127，page 为 0~6 */
void OLED_ShowChar(uint8_t page, uint8_t x, char ch)
{
    uint8_t i, buf[16];

    ch = ch - ' ';                                  // 字库从空格开始
    for(i = 0; i < 8; i++)  buf[i]     = OLED_F8x16[ch][i];       // 上半部分
    for(i = 0; i < 8; i++)  buf[i + 8] = OLED_F8x16[ch][i + 8];   // 下半部分

    OLED_SetCursor(page, x);
    OLED_WriteData(buf, 8);                         // 写上半页
    OLED_SetCursor(page + 1, x);
    OLED_WriteData(buf + 8, 8);                     // 写下半页
}
```

字模从哪来？用取模软件（PCtoLCD2002）按固定参数生成，课程配套的 `OLED_Font.h` 已经取好。参数必须和代码里的读取方式一致，否则字是「花」的：

| 取模参数 | 课程采用 | 选错的表现 |
| --- | --- | --- |
| 字模选项 | 阴码 | 选阳码 → 字变成黑底白字（反色） |
| 取模走向 | 列行式（逐列） | 选逐行 → 字被旋转 90° 或错位 |
| 字节内位序 | 逆向（低位在前） | 选顺向 → 每个字节上下翻转，字是碎的 |
| 输出格式 | C51 格式 | 十六进制格式要自己加 `0x` |

:::warn 90% 的「花屏」都是这三件事
① 字模参数不对（字是碎的、反的）；② 坐标算错（写到屏幕外，SSD1306 会绕回来覆盖别处）；③ `page` 传了 7 还写两页（`page+1 = 8` 越界，屏幕行为不可预测）。
先测一行纯 ASCII，通了再上汉字——汉字 32 字节跨两页，出错时更难判断是哪一步错。
:::

## 六、把常用显示函数补齐

一套能用的 OLED 驱动只需要这几个函数，建议一次写全，后面每课都直接复用：

| 函数 | 作用 | 注意 |
| --- | --- | --- |
| `OLED_Clear()` | 全屏清 0 | 用 8 个页 × 128 列的空白数据批量写，别逐个像素清 |
| `OLED_ShowChar(page, x, ch)` | 8×16 ASCII | `x` 每次加 8 |
| `OLED_ShowString(page, x, str)` | 字符串 | 循环调 `ShowChar`，`x += 8` |
| `OLED_ShowChinese(page, x, idx)` | 16×16 汉字 | 32 字节，跨两页，`x += 16` |
| `OLED_ShowNum(page, x, num, len)` | 十进制数 | 先取位再逐位显示，注意前导 0 |
| `OLED_ShowFloat(page, x, f, intLen, decLen)` | 小数 | 放大成整数再取位，避免 `%f` 占 Flash |
| `OLED_ShowBin(page, x, num, len)` | 二进制 | 调试寄存器时非常有用 |

## 练习
Q| SSD1306 的显存是 1024 字节，可屏幕有 8192 个像素，为什么够用？
A| 因为它是单色屏：一个像素只要 1 位（亮/灭）。1024 字节 = 8192 位，正好对应 8192 个像素。
A| 组织方式是「一列 8 个像素打包成一个字节」，所以 8 页 × 128 列 × 8 位 = 8192。这也是字号必须是 8 的倍数的原因。
Q| 代码编译下载都正常，OLED 一点反应都没有（全黑）。最可能漏了哪条命令？
A| 漏了开电荷泵：`OLED_WriteCommand(0x8D); OLED_WriteCommand(0x14);`。SSD1306 的 OLED 面板需要 7–9V 驱动电压，靠内部电荷泵升压，不开就完全不亮。
A| 其次是 `0xAF`（开显示）和上电延时 `Delay_ms(100)`。排查顺序：先量 VCC 有没有 3.3V → 再看 I2C 有没有应答（`ReceiveAck` 返回 0 才正常）→ 最后查初始化序列。
Q| 显示出来的汉字是「碎块」或上下颠倒，问题出在哪？
A| 字模的取模参数和代码的读取方式不匹配。课程字库按「阴码 + 列行式 + 逆向（低位在前）」生成，若软件里选了「逐行」或「顺向」，每个字节的 8 个位顺序就不对，字就碎了。
A| 修法不是改代码，而是重新取模：在 PCtoLCD2002 里把「取模走向」设为列行式、「字节内位序」设为逆向，重新生成数组替换 `OLED_Font.h`。
Q| 为什么写一个 32 字节的汉字，最好放在一次 Start…Stop 里连续发，而不是每字节都 Start 一次？
A| I2C 每次 Start/Stop 都有额外时序开销，且 SSD1306 内部地址指针在 Stop 后不会自动归位到「接着写」，多次 Start 容易出现地址错位。
A| 连续写时控制器会自动递增列地址，一次传完 32 字节最稳也最快。同理 `OLED_Clear` 应该一次写 128 字节的空白缓冲，而不是逐字节调用。
