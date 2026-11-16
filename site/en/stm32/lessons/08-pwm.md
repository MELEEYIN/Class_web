# 08 · 输出比较与 PWM：呼吸灯、舵机、直流电机
part: 第三篇 · 中断与定时器
video: P15 – P16 · TIM 输出比较 / PWM 驱动呼吸灯、舵机、直流电机
level: 进阶
lead: PWM 的本质是「用一个不断计数的计数器，把占空比这个数字变成一段时间的平均值」。硬件替你在后台翻转引脚，CPU 只管改一个寄存器——这就是为什么呼吸灯可以不占用主循环，电机可以一边转一边通信。
goals:
- 能画出「CNT 与 CCR 比较 → 输出参考信号 → 引脚」这条通路
- 能由目标频率和分辨率反推出 PSC 与 ARR，并算出 CCR 与占空比的换算
- 能做出呼吸灯、舵机转角、直流电机调速三个现象
- 知道为什么 PWM 引脚必须配成复用推挽，以及电源为什么必须共地
stats: 6 个小节 · 5 张表 · 4 道练习

## 一、输出比较：比较一次，翻转一次

定时器里有个一直在跑的 `CNT`，还有一个你设定的 `CCR`（捕获/比较寄存器）。硬件不停地做一件事：**比较 CNT 和 CCR**。比较结果决定输出引脚的高低。

| 模式 | 规则 | 结果 |
| --- | --- | --- |
| 冻结 | 不比较 | 引脚保持 |
| 匹配时置有效 | CNT == CCR 时输出高 | 单脉冲 |
| 匹配时翻转 | CNT == CCR 时翻转 | 输出方波，占空比 50% |
| **PWM 模式 1** | CNT < CCR 输出有效电平，否则无效 | 最常用：CCR 越大，高电平越宽 |
| **PWM 模式 2** | 与模式 1 相反 | CCR 越大，低电平越宽 |

「有效电平」是高还是低，由 `TIM_OCPolarity_High/Low` 决定。默认高有效，于是：

**占空比 = CCR / (ARR + 1)　　PWM 频率 = fCK / ((PSC + 1) × (ARR + 1))**

两个公式一起用：先定频率（PSC、ARR），再用 CCR 调占空比。ARR 决定分辨率——ARR = 99 时占空比只能取 0%–100% 之间的 100 档（1% 一步），ARR = 999 就有 1000 档。

## 二、通道与引脚：查表比记更靠谱

| 定时器 | 通道 1 | 通道 2 | 通道 3 | 通道 4 |
| --- | --- | --- | --- | --- |
| TIM2 | PA0 | PA1 | PA2 | PA3 |
| TIM3 | PA6 | PA7 | PB0 | PB1 |
| TIM4 | PB6 | PB7 | PB8 | PB9 |

（同一通道还能重映射到别的脚，用 `GPIO_PinRemapConfig`，本课不用。）

一个定时器的四个通道**共用同一个 CNT 和 ARR**，所以四个通道的 PWM 频率必然相同，只有 CCR 可以各不相同。想同时输出 50Hz 舵机信号和 1kHz 呼吸灯，就得用两个定时器。

## 三、呼吸灯：TIM2_CH1 → PA0

```c
#include "stm32f10x.h"

void PWM_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;
    TIM_OCInitTypeDef TIM_OCInitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);

    /* ① 引脚：必须是复用推挽，交给定时器控制 */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_0;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② 时基：72MHz / 720 / 100 = 1kHz，占空比分辨率 1% */
    TIM_TimeBaseStructure.TIM_Prescaler     = 720 - 1;     // PSC = 719
    TIM_TimeBaseStructure.TIM_Period        = 100 - 1;     // ARR = 99
    TIM_TimeBaseStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode   = TIM_CounterMode_Up;
    TIM_TimeBaseStructure.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseStructure);

    /* ③ 输出比较：PWM 模式 1，高电平有效 */
    TIM_OCInitStructure.TIM_OCMode      = TIM_OCMode_PWM1;
    TIM_OCInitStructure.TIM_OutputState = TIM_OutputState_Enable;
    TIM_OCInitStructure.TIM_Pulse       = 0;               // 初始 CCR = 0（全灭）
    TIM_OCInitStructure.TIM_OCPolarity  = TIM_OCPolarity_High;
    TIM_OC1Init(TIM2, &TIM_OCInitStructure);               // 通道 1

    TIM_Cmd(TIM2, ENABLE);
}

/* 0~100 的占空比 */
void PWM_SetCompare1(uint8_t duty)
{
    TIM_SetCompare1(TIM2, duty);       // 直接写 CCR1 = duty
}
```

呼吸灯的主循环：

```c
int main(void)
{
    uint8_t duty = 0;
    int8_t  step = 1;

    PWM_Init();
    while(1){
        PWM_SetCompare1(duty);
        Delay_ms(10);
        duty += step;
        if(duty == 0 || duty == 100) step = -step;   // 到顶或到底就反向
    }
}
```

`duty` 必须是 `uint8_t`（0–255），如果写成 `int8_t`，加到 100 没问题但减法到 0 再减就变 −1，`TIM_SetCompare1` 会收到 255，灯突然全亮——这是「呼吸灯跳到最亮再熄」的经典原因。

## 四、舵机：50Hz 里的 0.5–2.5ms

SG90 这类舵机认的是脉宽：**每 20ms 来一个脉冲，脉宽 0.5ms 对应 0°，1.5ms 对应 90°，2.5ms 对应 180°**。

| 参数 | 计算 | 取值 |
| --- | --- | --- |
| 频率 | 50Hz → 周期 20ms | — |
| PSC | 72MHz / 7200 = 10kHz（每跳 0.1ms） | 7199 |
| ARR | 20ms / 0.1ms = 200 → 计 200 次 | 199 |
| CCR @ 0° | 0.5ms / 0.1ms = 5 | 5 |
| CCR @ 90° | 1.5ms / 0.1ms = 15 | 15 |
| CCR @ 180° | 2.5ms / 0.1ms = 25 | 25 |

所以 ARR 固定 199，CCR 在 5–25 之间就是 0–180°。写成一个角度函数：

```c
/* 角度 0~180 → CCR 5~25。TIM2_CH2 需要单独初始化 OC2Init */
void Servo_SetAngle(uint8_t angle)
{
    if(angle > 180) angle = 180;
    TIM_SetCompare2(TIM2, 5 + (uint16_t)angle * 20 / 180);   // 5 + angle/9
}
```

`angle * 20 / 180` 先乘后除，避免整数除法把小数全丢成 0。如果角度范围要求更细，可以放大 ARR（比如 ARR = 1999、每跳 10μs），代价是 CCR 数值更大、分辨率更高。

## 五、直流电机：PWM 调速 + 两根方向脚

电机不能直接接 IO 抽电流（堵转电流能到 1A 以上）。中间要加 TB6612 这类双 H 桥驱动：

| TB6612 | 接哪 | 作用 |
| --- | --- | --- |
| VM | 电池 5–12V | 电机电源（**不要接 3.3V**） |
| VCC | 3.3V | 逻辑电源 |
| GND | 与 STM32 共地 | 必须共地，否则控制信号无参考 |
| PWMA | PA1（TIM2_CH2） | 速度：占空比 |
| AIN1 / AIN2 | PA4 / PA5 | 方向：一高一低正转，反过来反转，同低刹车 |
| STBY | 3.3V | 使能，拉低则整个芯片待机 |

```c
/* speed: -100 ~ 100，负数反转 */
void Motor_SetSpeed(int8_t speed)
{
    if(speed >= 0){
        GPIO_SetBits(GPIOA, GPIO_Pin_4);
        GPIO_ResetBits(GPIOA, GPIO_Pin_5);
    }else{
        GPIO_ResetBits(GPIOA, GPIO_Pin_4);
        GPIO_SetBits(GPIOA, GPIO_Pin_5);
        speed = -speed;
    }
    TIM_SetCompare2(TIM2, speed);       // ARR = 99 时，speed 即占空比百分数
}
```

:::warn 电机实验最容易烧的三处
① **电源不共地**：TB6612 的 GND 没接到 STM32 的 GND，控制信号没有参考点，电机乱转或不动。
② **用 USB 供电**：USB 口最多 500mA，电机启动瞬间的浪涌能到 1A，会把电压拉到 3V 以下，STM32 直接复位。电机必须用独立电池，只共地。
③ **方向脚同时为高**：AIN1 = AIN2 = 1 时 TB6612 是「短路刹车」，电流很大且发热，长时间会烧驱动。代码里必须保证两者互斥。
:::

## 六、三个现象，一条主线

| 现象 | 定时器 | 频率 | 关键参数 |
| --- | --- | --- | --- |
| LED 呼吸灯 | TIM2_CH1 (PA0) | 1kHz | ARR=99，CCR 0→100→0 |
| 舵机转角 | TIM2_CH2 (PA1) | 50Hz | ARR=199，CCR 5→25 |
| 直流电机调速 | TIM2_CH2 (PA1) | 1–20kHz | ARR=99，CCR 0→100 |

注意舵机和电机抢同一个引脚（PA1）。做实验时一次只接一个，或者把电机换到 TIM3_CH1（PA6）。**同一个定时器的通道共用 ARR**，所以「50Hz 舵机 + 1kHz 呼吸灯」不能放在同一个 TIM 里——这是第 08 课最容易被忽略的硬约束。

## 练习
Q| 要输出 1kHz 的 PWM，且占空比能精确到 1%，请给出 (PSC, ARR) 并验算。
A| 1kHz → 周期 1ms。取 PSC = 71（÷72 → 1MHz，每跳 1μs），ARR = 999（1000 × 1μs = 1ms ✓）。
A| 分辨率 = 1/1000 ≈ 0.1%，满足 1% 要求。若取 ARR = 99 则需要 PSC = 719，分辨率 1%，刚好够但不留余量。
Q| 呼吸灯程序里 `duty` 用了 `int8_t`，为什么灯会「跳到最亮再熄」？
A| `int8_t` 范围是 −128～127。当 duty 从 0 减 1 变成 −1 时，传给 `TIM_SetCompare1`（参数是 `uint16_t`）会发生隐式转换，−1 变成 65535。
A| 而 CCR 大于 ARR+1 时，PWM 模式 1 的输出一直是有效电平（全亮）。所以现象是「暗到 0 突然全亮，再掉回来」。改用 `uint8_t` 或 `int16_t` 并做范围保护即可。
Q| 舵机接在 PA1（TIM2_CH2），代码写好了但舵机纹丝不动，示波器也没有波形。先查什么？
A| 先查引脚模式：必须是 `GPIO_Mode_AF_PP`（复用推挽）。配成普通推挽时，定时器根本没接管引脚，示波器上什么都没有。
A| 其次查通道：`PWM_Init` 里只调了 `TIM_OC1Init`，通道 2 需要单独 `TIM_OC2Init`，且 `TIM_OutputState_Enable`。最后确认 `TIM_Cmd(TIM2, ENABLE)` 有没有执行。
Q| 为什么电机必须用独立电源，只把 GND 和 STM32 连在一起？
A| 电机启动和堵转时电流可达 1A 以上，远超 USB 口和板载 LDO 的供给能力，会把 3.3V 拉低，导致 STM32 欠压复位（现象是「电机一转，程序就重启」）。
A| 独立供电后，两边必须有共同的地参考，否则 TB6612 收到的 PWM 高低电平没有基准，可能误判。所以「电源分开、地必须相连」是电机驱动的标准做法。
