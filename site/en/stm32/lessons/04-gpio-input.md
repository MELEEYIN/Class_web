# 04 · GPIO 输入：按键与光敏传感器
part: 第二篇 · GPIO 与显示
video: P7 – P8 · GPIO 输入 / 按键控制 LED、光敏控制蜂鸣器
level: 基础
lead: 输入不是「读一下就完事」。一个引脚如果什么都不接，读回来的值是随机的——所以输入的第一件事是给它一个确定的默认电平；第二件事是处理机械按键的抖动。
goals:
- 能根据按键的接法选对上拉/下拉/浮空输入，而不是背模式表
- 能写出带 20ms 消抖、支持「按下/松开」两种触发的按键函数
- 能说清为什么按键要消抖，以及抖动在示波器上是什么样
- 能用光敏模块的数字输出控制蜂鸣器
stats: 5 个小节 · 3 张表 · 4 道练习

## 一、为什么输入必须先「定一个默认值」

数字输入只有两种解读：高或低。但引脚如果悬空（什么都没接），它既不是高也不是低——它是一根天线，会捡周围的电磁噪声。这时读 `IDR` 得到的是随机 0/1，程序就会「自己乱跳」。

解决办法是给引脚接一个电阻，把它「默认」拉到某一侧：

| 接法 | 内部配置 | 空闲时读到 | 按键接法 | 按下时读到 |
| --- | --- | --- | --- | --- |
| 上拉输入 | `GPIO_Mode_IPU`（内部 40kΩ 接 VDD） | 1 | 按键另一端接 **GND** | 0 |
| 下拉输入 | `GPIO_Mode_IPD`（内部 40kΩ 接 VSS） | 0 | 按键另一端接 **VDD** | 1 |
| 浮空输入 | `GPIO_Mode_IN_FLOATING` | 不确定 | 外部已有上/下拉电阻 | 取决于外部 |

嵌入式里九成的按键都是「一端接 IO、一端接 GND」+ 上拉输入，因为这样按键不按下时 IO 是确定的高电平，而且 **GND 到处都有，接线最省事**。代价是逻辑反了：**读到 0 才表示按下**。这个「反逻辑」是按键代码里最常见的 bug 来源。

:::tip 用内部上拉还是外部上拉
内部上拉约 40kΩ，够用但偏弱：杜邦线拉长到 20cm 以上、或者旁边有电机干扰时，可能被耦合噪声拉低。工业上一般用外部 10kΩ 上拉 + 100nF 电容滤波。学习阶段用内部上拉完全够，遇到「没按也乱触发」再补外部电阻。
:::

## 二、机械按键的抖动：为什么必须消抖

轻触按键内部是金属弹片。按下和松开的瞬间，弹片会在接触点之间弹跳 5–20ms，电压在 0 和 1 之间来回跳好几次。如果主循环跑得足够快（72MHz 下几微秒一轮），一次按键会被读成「按下 → 松开 → 按下 → 松开」好几次。

三种消抖方式：

| 方式 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 延时消抖 | 读到变化后 `Delay_ms(20)` 再读一次 | 代码最短，易懂 | 阻塞 20ms，期间别的事都干不了 |
| 定时扫描 | 每 10ms 由定时中断采样，连续两次相同才认 | 不阻塞，可同时处理多个键 | 需要定时器（第 07 课） |
| 状态机 | 记录「稳定态 + 计时」，松手才算一次 | 最严谨，能区分长按短按 | 代码稍长 |

本课先用延时消抖把现象做出来；第 07 课有了定时中断，再改成非阻塞版本——这是从「能跑」到「能用在产品里」的一步。

## 三、按键代码：读、消抖、返回键值

```c
#include "stm32f10x.h"
#include "Delay.h"

void Key_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;      // 上拉输入
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_1 | GPIO_Pin_11;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStructure);
}

/* 返回：0 = 没按，1 = KEY1 按下，2 = KEY2 按下；松手才返回一次 */
uint8_t Key_GetNum(void)
{
    static uint8_t last = 0;                            // 上一次的稳定状态
    uint8_t now = 0;

    if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1)  == 0) now = 1;
    if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_11) == 0) now = 2;

    if(now != 0 && last == 0){                          // 出现「按下」的跳变
        Delay_ms(20);                                   // 等抖动过去
        if(GPIO_ReadInputDataBit(GPIOB, now == 1 ? GPIO_Pin_1 : GPIO_Pin_11) == 0){
            last = now;
            while(GPIO_ReadInputDataBit(GPIOB, now == 1 ? GPIO_Pin_1 : GPIO_Pin_11) == 0);
            last = 0;                                   // 等松手，避免连发
            return now;
        }
    }
    return 0;
}
```

三个细节值得说：

- **`GPIO_ReadInputDataBit` 读的是 `IDR`（输入数据寄存器）**，不是 `ODR`。用错函数（比如写成 `GPIO_ReadOutputDataBit`）读到的是「你让它输出什么」，不是「脚上实际是什么」，按键永远读不到。
- **`while(引脚 == 0);` 等松手**，让一次按压只返回一次。不然按住不放，主循环每轮都返回一次，LED 会闪成一片。
- **`static` 变量记住上一次状态**，才能区分「一直按着」和「刚按下」。去掉 `static` 就是每轮都当成新按下。

## 四、光敏传感器：读别人算好的结果

光敏模块（套件里常见的那种三针/四针小板）内部是「光敏电阻 + 比较器（LM393）」：光敏电阻分压后与电位器设定的阈值比较，结果直接以数字高低电平从 `DO` 脚输出。所以对 STM32 来说，它和按键没有区别——一个会自己变的数字输入。

| 引脚 | 作用 | 接法 |
| --- | --- | --- |
| VCC / GND | 供电 | 3.3V / GND |
| DO | 数字输出（阈值比较结果） | 接 PB13，配浮空或上拉输入 |
| AO | 模拟输出（光敏电阻分压原值） | 接 PA0，第 11 课用 ADC 读 |

```c
/* 光越暗 → DO 输出高（具体极性看模块电位器，先实测一次） */
void Light_Beep(void)
{
    if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_13) == 1){
        GPIO_ResetBits(GPIOB, GPIO_Pin_12);    // 有源蜂鸣器低电平响
    }else{
        GPIO_SetBits(GPIOB, GPIO_Pin_12);
    }
}
```

:::warn 不要猜 DO 的极性
不同厂家的光敏模块，比较器同相/反相端接法不同，遮光时 DO 可能是高也可能是低。拿到模块先用万用表量一次：遮住 → 记下电平；照光 → 再记一次。猜错的结果是「逻辑全反」，代码看起来完全正确。
:::

## 五、把输入接进主循环

```c
int main(void)
{
    uint8_t key;

    LED_Init();
    BEEP_Init();
    Key_Init();

    while(1){
        key = Key_GetNum();
        if(key == 1){                          // KEY1：翻转 LED1
            static uint8_t s = 0;
            s = !s;
            if(s) GPIO_ResetBits(GPIOA, GPIO_Pin_0);
            else  GPIO_SetBits(GPIOA, GPIO_Pin_0);
        }
        if(key == 2){                          // KEY2：蜂鸣器响一下
            GPIO_ResetBits(GPIOB, GPIO_Pin_12);
            Delay_ms(100);
            GPIO_SetBits(GPIOB, GPIO_Pin_12);
        }
        Light_Beep();
    }
}
```

这个主循环有个隐患：`Key_GetNum` 里的 `Delay_ms(20)` 和 `while(等松手)` 会**卡住整个循环**。按键按住不放时，`Light_Beep()` 就不再执行了。学习阶段无所谓，但这也正是第 06 课要学外部中断、第 07 课要学定时扫描的动机——把「等事件」变成「事件来找我」。

## 练习
Q| 按键一端接 PB1、另一端接 GND，程序里却把 PB1 配成了下拉输入（`GPIO_Mode_IPD`），会出现什么现象？
A| 下拉输入时空闲电平被内部 40kΩ 拉到 0，按下接 GND 也是 0，读到的永远是 0——现象是「一直显示按下」，或者按住和不按没区别。
A| 正确配置是上拉输入（`GPIO_Mode_IPU`）：空闲读到 1，按下被 GND 拉低读到 0。反过来，如果按键接的是 VDD，就要用下拉输入。
Q| 为什么 `Key_GetNum` 里要用 `while(引脚 == 0);` 等松手？去掉会怎样？
A| 去掉后，只要手按着，主循环每转一圈就检测到一次「按下」，1 秒能触发几万次。如果是「翻转 LED」，看起来是 LED 半亮；如果是「计数」，数字会疯长。
A| 加了这个循环，一次按压只产生一次返回值。代价是按住不放时程序卡在这里——这就是「阻塞式按键」的本质缺陷，后面用定时扫描替代。
Q| `GPIO_ReadInputDataBit` 和 `GPIO_ReadOutputDataBit` 在读按键时有什么区别？
A| `ReadInputDataBit` 读 `IDR`，反映引脚上的**实际电平**（外部电路决定的），按键必须用这个。
A| `ReadOutputDataBit` 读 `ODR`，反映你**让它输出什么**。在输入模式下 `ODR` 只用于存上拉/下拉的配置，和外部电平无关，所以读按键会永远得到同一个值。
Q| 光敏模块的 DO 接到 PB13，你希望「天黑时蜂鸣器响」，但实测是「天亮时响」。不改硬件，代码上怎么修最简单？
A| 把判断条件取反：`if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_13) == 0)`。因为模块的比较器极性由厂家接法决定，软件取反等价于换极性。
A| 更彻底的做法是改硬件：调模块上的电位器（改变阈值）或交换比较器两个输入。软件取反最省事，但要在注释里写清「此模块遮光输出低」，否则下次换模块又要重新试。
