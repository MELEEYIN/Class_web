# 03 · GPIO 输出：LED 与蜂鸣器
part: 第二篇 · GPIO 与显示
video: P5 – P6 · GPIO 输出 / LED 流水灯与蜂鸣器
level: 基础
lead: 输出就是把寄存器某一位写成 0 或 1；但写之前必须先做两件事——给这个端口开时钟、把引脚配成「输出」。忘了第一步，写进去的值永远不会出现在脚上。
goals:
- 能背出 GPIO 的八种工作模式，说清推挽和开漏的区别
- 能独立写出「开时钟 → 配结构体 → 初始化 → 读写」四步
- 能做出 LED 闪烁、八灯流水、蜂鸣器三种现象
- 能解释为什么套件上的 LED 是低电平点亮
stats: 5 个小节 · 5 张表 · 4 道练习

## 一、八种模式：四进四出

每个 GPIO 引脚背后是一小片电路，通过两个配置寄存器（`CRL` 管 0–7 位，`CRH` 管 8–15 位）里的 4 个比特选择模式。八种模式可以分成两半：

| 模式 | 库里的宏 | 电路状态 | 什么时候用 |
| --- | --- | --- | --- |
| 浮空输入 | `GPIO_Mode_IN_FLOATING` | 上下拉都断开 | 外部已有确定电平（如串口 RX、编码器） |
| 上拉输入 | `GPIO_Mode_IPU` | 内部 40kΩ 接到 VDD | 按键一端接地，没按下时读 1 |
| 下拉输入 | `GPIO_Mode_IPD` | 内部 40kΩ 接到 VSS | 按键一端接 VDD，没按下时读 0 |
| 模拟输入 | `GPIO_Mode_AIN` | 上下拉断开，数字部分关闭 | ADC 采集电压（第 11 课） |
| 推挽输出 | `GPIO_Mode_Out_PP` | P-MOS + N-MOS 都能导通 | 驱动 LED、蜂鸣器、普通数字信号 |
| 开漏输出 | `GPIO_Mode_Out_OD` | 只有 N-MOS，只能拉低 | I2C 的 SDA/SCL（第 14 课）、电平转换 |
| 复用推挽 | `GPIO_Mode_AF_PP` | 引脚交给片上外设控制 | PWM 输出、SPI 的 SCK/MOSI、USART 的 TX |
| 复用开漏 | `GPIO_Mode_AF_OD` | 同上，但只能拉低 | 硬件 I2C 的 SCL/SDA |

**推挽 vs 开漏**是这一课唯一需要动脑的地方：

- 推挽：想输出高就打开上面的 P-MOS（接到 3.3V），想输出低就打开下面的 N-MOS（接到 GND）。两种状态都是「主动驱动」，所以带负载能力强、边沿陡。
- 开漏：上面那只管子根本不存在，只能主动拉低；要输出高，只能靠外部上拉电阻把线「拉」上去。好处是**可以做线与**——I2C 总线上任何一个从机拉低，整条线就是低，主机就知道有人在应答。这就是 I2C 必须用开漏的原因。

:::warn 复用模式最容易犯的错
配了 `GPIO_Mode_AF_PP` 却忘了开外设时钟（比如 TIM2），引脚就变成「悬空的高阻态」：示波器上没有波形，程序却一切正常。凡是「代码看起来对、脚上没信号」，先查外设时钟。
:::

## 二、四步配置法

标准库把所有外设的初始化都统一成了这个套路，后面每一课都是它的变体：

1. **开时钟**：GPIOA 挂在 APB2 上 → `RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);`
2. **填结构体**：`GPIO_InitTypeDef` 有三个成员——`GPIO_Pin`（哪几位）、`GPIO_Mode`（哪种模式）、`GPIO_Speed`（输出速度 2/10/50MHz）
3. **调初始化**：`GPIO_Init(GPIOA, &GPIO_InitTypeDef 变量);`
4. **读写**：输出用 `GPIO_SetBits` / `GPIO_ResetBits` / `GPIO_WriteBit`；输入用 `GPIO_ReadInputDataBit`

第 2 步里的 `GPIO_Speed` 只对输出模式有意义，它决定输出驱动器的翻转速率。驱动 LED、蜂鸣器这种慢速负载，`GPIO_Speed_2MHz` 就够；跑 SPI、PWM 高速信号才需要 50MHz。选太快会增加电磁干扰和功耗，选太慢波形会变钝。

## 三、点亮八个 LED：流水灯

套件上的八位 LED 模块是这样接的：八个 LED 的阳极一起接 3.3V，阴极各经限流电阻接到 PA0–PA7。**所以 IO 输出低电平（0）灯亮，输出高电平（1）灯灭**。这一点如果搞反了，现象就是「写 1 反而亮」，程序看起来完全没毛病。

```c
#include "stm32f10x.h"
#include "Delay.h"

void LED_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);   // ① 开 GPIOA 时钟

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;       // 推挽输出
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_All;           // PA0~PA7 一次配完
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);                  // ② 写进寄存器

    GPIO_SetBits(GPIOA, GPIO_Pin_All);                      // 全部熄灭（高电平）
}

/* 八灯流水：每次只让低 8 位里的一位为 0，高 8 位原样保留 */
void LED_Flow(void)
{
    uint8_t i;
    for(i = 0; i < 8; i++){
        uint16_t keep = GPIO_ReadOutputData(GPIOA) & 0xFF00;   // 保住 PA8~PA15
        GPIO_Write(GPIOA, keep | (~(0x0001 << i) & 0x00FF));
        Delay_ms(120);
    }
}
```

`GPIO_Pin_All` 是 0xFFFF，会把 PA0–PA15 全部配成推挽输出。这里 PA8–PA15 没用上，配了也无害（不接线就是悬空输出）；但要养成习惯：**只配自己用的位**，否则以后接别的东西会冲突（比如 PA13/PA14 是 SWD，配成普通输出就把调试口占了）。

`GPIO_Write` 是整端口写 16 位，比逐个 `SetBits/ResetBits` 快，适合流水灯这种整体刷新。但它写的是 **ODR 的整个低 16 位**，所以必须先把高 8 位的原值取出来拼回去，否则 PA8–PA15 会被顺手改掉。

:::warn GPIO_Write 的陷阱
`GPIO_Write(GPIOA, ~(0x0001 << i))` 传入的是 0xFFFE 这类值，**高 8 位被写成 1**（对 PA8–15 是「输出高」）。如果 PA8–15 上还接了别的东西，会被误动作。
更稳的写法是只改低 8 位：`GPIO_Write(GPIOA, (GPIO_ReadOutputData(GPIOA) & 0xFF00) | (~(0x0001 << i) & 0x00FF));`
或者干脆用 `GPIO_ResetBits(GPIOA, 0x0001 << i); GPIO_SetBits(GPIOA, ~(0x0001 << i) & 0x00FF);`。流水灯看不出差别，但接上别的东西就会出问题。
:::

## 四、蜂鸣器：先分清有源还是无源

| 类型 | 内部结构 | 给什么信号 | 怎么判断 |
| --- | --- | --- | --- |
| 有源蜂鸣器 | 内部自带振荡电路 | 给高/低电平就响，频率固定 | 直接接 3.3V 和 GND 就「滴」一声 |
| 无源蜂鸣器 | 只有电磁线圈，靠外部方波驱动 | 必须给 2–5kHz 方波，频率决定音调 | 接直流不响，接方波才响 |

套件里通常是有源蜂鸣器，接 PB12，配置和 LED 一模一样：

```c
#define BEEP_PORT  GPIOB
#define BEEP_PIN   GPIO_Pin_12

void BEEP_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Pin   = BEEP_PIN;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(BEEP_PORT, &GPIO_InitStructure);

    GPIO_ResetBits(BEEP_PORT, BEEP_PIN);    // 关掉（低电平不响）
}
```

有源蜂鸣器的工作电流常在 20–30mA，而 STM32 单个 IO 的绝对最大输出是 25mA（推荐 8mA 以内）。直接接能用，但声音偏小、长期跑会发热。规范做法是 IO 驱动一个 NPN 三极管（如 S8050）或 MOS 管，蜂鸣器接在集电极回路上，基极串 1kΩ 电阻。

## 五、这一课能延伸出的三种现象

| 现象 | 改哪一行 | 说明 |
| --- | --- | --- |
| LED 闪烁 | `GPIO_ResetBits` / `SetBits` 加 `Delay_ms(500)` | 最基础，验证工程通不通 |
| 八灯流水 | 循环移位 + `GPIO_Write` | 练习位运算与「整体刷新」的思路 |
| 蜂鸣器滴滴 | `BEEP` 脚 500ms 翻转 | 有源蜂鸣器只能「滴」，想变调要给方波（第 08 课 PWM） |

流水灯的延时如果短于 60ms，肉眼看到的是「一整条都在亮」，不是流水。人眼的视觉暂留约 1/24 秒，所以流水灯每步至少给 80–120ms。

## 练习
Q| 套件上的 LED 阳极接 3.3V，阴极接 PA0。要让 LED 亮，应该给 PA0 写 0 还是 1？为什么？
A| 写 0（低电平）。LED 导通条件是阳极电位高于阴极电位并超过正向压降（红色约 1.8V）。阳极固定 3.3V，只有阴极被拉到 0V 时才有压差，电流才会流过。
A| 如果写 1（3.3V），两端等电位，没有电流，灯不亮。所以这类接法叫「低电平驱动」，初始化时要把引脚先置高（熄灭），避免上电瞬间闪一下。
Q| 想把 PA8 配成推挽输出，但只写了 `GPIO_Init(GPIOA, ...)` 却把 `GPIO_Pin` 设成 `GPIO_Pin_0`，PA8 会有输出吗？
A| 不会。`GPIO_Pin` 决定「配哪几位」，`GPIO_Pin_0` 只把第 0 位的配置写进 `CRL`，PA8 对应的 `CRH` 位没动，仍是复位后的默认值——浮空输入。
A| 这时对 PA8 调 `GPIO_SetBits` 只会改 `ODR` 的第 8 位，但引脚处于输入模式，输出驱动器没打开，脚上测不到电平。这是「写代码没错、示波器没波形」的经典原因。
Q| 为什么 I2C 的 SDA/SCL 一定要配成开漏（或复用开漏），而不能用推挽？
A| 因为 I2C 是多主多从的总线，一条线上挂着多个器件。推挽输出高电平时会主动把线拉到 3.3V，若另一个器件此时输出低电平（拉地），两只管子直接对通，形成大电流，可能烧引脚。
A| 开漏只能主动拉低、靠外部上拉电阻恢复高电平，天然实现「线与」：任何一方拉低，线就是低。这也是 I2C 必须外接 4.7kΩ 上拉电阻的原因——没有上拉，开漏永远输出不了高电平。
Q| 有源蜂鸣器接在 PB12 上，程序里一直给它 1kHz 方波，声音会变吗？
A| 不会变调。有源蜂鸣器内部自带振荡电路，外部给的方波只是「开关」，音调由它自己的振荡频率决定；给 1kHz 或 10kHz 方波，听到的都是同一个音，只是可能因为占空比变化而音量略有不同。
A| 想要不同音调（比如播放简单旋律），必须换**无源**蜂鸣器，用 PWM 给不同频率的方波——这正是第 08 课 PWM 输出比较的用途。
