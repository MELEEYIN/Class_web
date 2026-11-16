# 09 · 输入捕获：测频率与占空比
part: 第三篇 · 中断与定时器
video: P17 – P18 · TIM 输入捕获 / 输入捕获测频率、PWMI 测频率占空比
level: 难点
lead: 输入捕获就是「在边沿到来的那一刻，把 CNT 的值拍下来」。一张快照是时刻，两张快照之差就是一个周期。有了周期，频率和占空比都只是除法。
goals:
- 能说清「测频法」与「测周法」各自适合什么频率段
- 能配出一路上升沿捕获，用两次 CCR 之差算出频率
- 能用 PWMI 模式一次拿到周期与高电平时间，算出占空比
- 知道捕获溢出、滤波器、通道绑定这三个坑怎么排
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、捕获通道：四个通道，各有一个 CCR

输入捕获和输出比较共用同一套 `CCR` 寄存器，只是方向相反：输出比较是「我写 CCR，硬件去比」，输入捕获是「边沿来了，硬件把 CNT 抄进 CCR」。

| 概念 | 含义 | 配置项 |
| --- | --- | --- |
| 捕获边沿 | 上升沿 / 下降沿 / 双边沿 | `TIM_ICPolarity_Rising` 等 |
| 输入分频 | 每 N 个边沿才捕获一次 | `TIM_ICPSC_DIV1` 最常用 |
| 滤波器 | 忽略短于 N 个采样周期的毛刺 | `TIM_ICFilter = 0x0F` 为最强 |
| 直接/间接映射 | 通道 1 可以映射到 TI1 或 TI2 | `TIM_ICSelection_DirectTI` |

滤波器这一项值得单独说：`ICFilter` 不是「软件消抖」，而是硬件数字滤波——它按 fCK_INT 的节奏对输入采样，连续 N 次一致才认。所以它能滤掉微秒级毛刺，但**滤不掉机械抖动**（那是毫秒级）。

## 二、两种测法：测频 vs 测周

| 方法 | 做法 | 误差来源 | 适合 |
| --- | --- | --- | --- |
| 测频法 | 固定窗口（如 1s）数脉冲个数 | 量化误差 ±1 个脉冲 | 高频（>10kHz） |
| 测周法 | 测一个周期的时长，取倒数 | 计时分辨率（1μs 或更细） | 低频（<10kHz） |
| 等精度 | 用两个计数器同时数「被测脉冲」与「标准时钟」 | 几乎无量化误差 | 全频段，实现复杂 |

第 07 课的外部时钟模式就是测频法。这一课做测周法——它响应更快，低频时更准。

公式（捕获两次上升沿，CCR1 分别是 t1、t2）：

**周期 T = (t2 − t1) × (PSC + 1) / fCK　　f = fCK / ((PSC + 1) × (t2 − t1))**

若 PSC = 71（CNT 每跳 1μs），则周期 = (t2 − t1) 微秒，频率 = 1,000,000 / (t2 − t1)。

## 三、测频率：单通道上升沿捕获

```c
#include "stm32f10x.h"

uint32_t IC_Val1 = 0, IC_Val2 = 0;
uint8_t  Is_First_Captured = 0;
float    Frequency = 0;

void IC_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;
    TIM_ICInitTypeDef TIM_ICInitStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM3, ENABLE);

    /* ① 捕获引脚：浮空或上拉输入（信号来自外部） */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_6;        // TIM3_CH1 = PA6
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* ② 时基：72MHz / 72 = 1MHz，CNT 每跳 1μs，ARR 尽量大以免溢出 */
    TIM_TimeBaseStructure.TIM_Prescaler     = 72 - 1;
    TIM_TimeBaseStructure.TIM_Period        = 65536 - 1;
    TIM_TimeBaseStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode   = TIM_CounterMode_Up;
    TIM_TimeBaseStructure.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(TIM3, &TIM_TimeBaseStructure);

    /* ③ 通道 1：上升沿捕获，不分频，滤波 0x0F */
    TIM_ICInitStructure.TIM_Channel     = TIM_Channel_1;
    TIM_ICInitStructure.TIM_ICPolarity  = TIM_ICPolarity_Rising;
    TIM_ICInitStructure.TIM_ICSelection = TIM_ICSelection_DirectTI;
    TIM_ICInitStructure.TIM_ICPrescaler = TIM_ICPSC_DIV1;
    TIM_ICInitStructure.TIM_ICFilter    = 0x0F;
    TIM_ICInit(TIM3, &TIM_ICInitStructure);

    /* ④ 开捕获中断 + NVIC */
    TIM_ITConfig(TIM3, TIM_IT_CC1, ENABLE);
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = TIM3_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 0;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);

    TIM_Cmd(TIM3, ENABLE);
}

void TIM3_IRQHandler(void)
{
    if(TIM_GetITStatus(TIM3, TIM_IT_CC1) == SET){
        if(Is_First_Captured == 0){
            IC_Val1 = TIM_GetCapture1(TIM3);           // 第一次：记下 t1
            Is_First_Captured = 1;
        }else{
            IC_Val2 = TIM_GetCapture1(TIM3);           // 第二次：记下 t2
            if(IC_Val2 > IC_Val1){
                Frequency = 1000000.0f / (IC_Val2 - IC_Val1);
            }
            Is_First_Captured = 0;                     // 重新开始下一轮
        }
        TIM_ClearITPendingBit(TIM3, TIM_IT_CC1);
    }
}
```

`if(IC_Val2 > IC_Val1)` 这个判断是必需的：如果两个边沿之间 CNT 溢出过一次（超过 65535μs ≈ 65ms，对应 <15Hz），`IC_Val2` 会小于 `IC_Val1`，减法变成负数。正确做法是在中断里也数「溢出次数」，把周期算成 `overflow × 65536 + (t2 − t1)`。

## 四、PWMI 模式：一次拿到周期和占空比

PWM 输入模式（PWMI）把同一个信号同时接到两个通道：CH1 抓上升沿（周期起点），CH2 抓下降沿（高电平结束）。于是：

- `CCR1` = 一个完整周期的长度
- `CCR2` = 高电平的长度

**占空比 = CCR2 / CCR1　　（单位：同一个 CNT 计数）**

```c
void PWMI_Init(void)
{
    /* 前半段与 IC_Init 相同：GPIO / 时基 / TIM_Cmd 略 */
    TIM_ICInitTypeDef s;

    /* CH1：上升沿，直接映射 TI1 */
    s.TIM_Channel     = TIM_Channel_1;
    s.TIM_ICPolarity  = TIM_ICPolarity_Rising;
    s.TIM_ICSelection = TIM_ICSelection_DirectTI;
    s.TIM_ICPrescaler = TIM_ICPSC_DIV1;
    s.TIM_ICFilter    = 0x0F;
    TIM_ICInit(TIM3, &s);

    /* CH2：下降沿，交叉映射 TI1（同一个输入脚，不同边沿） */
    s.TIM_Channel     = TIM_Channel_2;
    s.TIM_ICPolarity  = TIM_ICPolarity_Falling;
    s.TIM_ICSelection = TIM_ICSelection_IndirectTI;    // 注意是 Indirect
    TIM_ICInit(TIM3, &s);

    /* 让 CH1 触发时自动复位 CNT，这样每次都能直接读周期 */
    TIM_SelectInputTrigger(TIM3, TIM_TS_TI1FP1);
    TIM_SelectSlaveMode(TIM3, TIM_SlaveMode_Reset);

    TIM_Cmd(TIM3, ENABLE);
}

/* 主循环里直接读，不用中断 */
void Get_PWM(void)
{
    uint16_t period = TIM_GetCapture1(TIM3);   // 一整个周期
    uint16_t high   = TIM_GetCapture2(TIM3);   // 高电平时间
    if(period){
        Frequency = 1000000.0f / period;                 // PSC=71 → 1μs 一跳
        Duty      = (float)high / period * 100.0f;
    }
}
```

「从模式复位（Slave Reset）」这一步是 PWMI 的精髓：每次上升沿到来，硬件自动把 CNT 清零。于是 CCR1 直接就是周期长度，CCR2 直接就是高电平长度，不用做减法，也不用担心溢出。

## 五、坑：捕获读不到、读数乱跳、频率差一倍

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 中断完全不进 | 引脚配成了推挽输出，或忘了 `TIM_ITConfig` | 输入信号引脚必须是浮空/上拉输入 |
| 读数为 0 或巨大值 | 第一次捕获没区分，把 t1 当成了 t2 | 用 `Is_First_Captured` 标志分两次 |
| 低频时读数乱跳 | CNT 溢出没计入 | 中断里累加溢出次数，周期 = 溢出×65536 + 差值 |
| 频率正好是真实值的一半 | 输入分频设成了 `TIM_ICPSC_DIV2` | 改回 `TIM_ICPSC_DIV1` |
| PWMI 的占空比恒为 100% | CH2 用了 `DirectTI`，抓到的是同一个上升沿 | CH2 必须是 `IndirectTI` + 下降沿 |

:::tip 为什么测频率要用「两个上升沿」而不是「上升沿到下降沿」
上升沿到下降沿的高电平时间只反映占空比，不反映周期。占空比 10% 的 1kHz 方波，高电平只有 100μs，算出来会变成 10kHz。
测周期必须用「同类边沿」：上升→上升，或下降→下降。这是测周法唯一必须记牢的规则。
:::

## 六、测周法的边界

| 待测频率 | 周期（CNT 计数，1μs/跳） | 是否可行 |
| --- | --- | --- |
| 1MHz | 1 | 分辨率不够（±1 计数 = ±100% 误差） |
| 100kHz | 10 | 误差约 10%，勉强 |
| 10kHz | 100 | 误差 1%，可用 |
| 1kHz | 1000 | 很好 |
| 10Hz | 100000 | 超过 65535，必须处理溢出 |
| 1Hz | 1000000 | 溢出 15 次，必须累加 |

所以工程上的常规做法是：**高频用测频法（外部时钟计数），低频用测周法（输入捕获），中间用等精度**。三种都学过的标志，是能看着一个信号说出「该用哪种」。

## 练习
Q| 用 PSC = 71 的输入捕获测得两个上升沿的 CCR 差为 2000，信号频率是多少？占空比能算吗？
A| 频率 = 1,000,000 / 2000 = 500Hz。
A| 单通道上升沿捕获只测了周期，拿不到高电平长度，所以**算不出占空比**。要算占空比必须再加一个下降沿通道（PWMI 模式），或改用「双边沿捕获 + 四次时间戳」。
Q| 为什么测周期必须用两个同类边沿（上升→上升），而不能用上升→下降？
A| 上升→下降的间隔是高电平时间，等于「周期 × 占空比」。占空比一变，读数就跟着变，测出来的不是频率。
A| 只有同类边沿之间的间隔才等于一个完整周期。这也是 PWMI 模式要两个通道的原因：CH1 抓上升沿定周期，CH2 抓下降沿定高电平，两者之比才是占空比。
Q| 输入捕获测 5Hz 的信号时读数乱跳，可能是什么原因？怎么改？
A| 5Hz 的周期是 200ms，而 PSC=71 时 CNT 每 1μs 一跳，200ms 需要 200000 个计数，超过 16 位上限 65535，会溢出 3 次。
A| 两个改法：① 加大 PSC（比如 PSC = 7199，CNT 每 100μs 一跳，200ms 只要 2000 个计数，不溢出，但高频时分辨率变差）；② 保留 PSC 但在中断里累加溢出次数，周期 = 溢出次数 × 65536 + 差值。工程上常用 ②，兼顾量程与精度。
Q| PWMI 初始化里不加 `TIM_SelectSlaveMode(TIM3, TIM_SlaveMode_Reset)` 会怎样？
A| 也能工作，但每次都要自己做减法（`CCR2 − CCR1`），而且一旦周期超过 65535 就得处理溢出。
A| 加了复位从模式后，每个上升沿自动清 CNT，CCR1 直接等于周期、CCR2 直接等于高电平宽度，代码更短也更抗溢出。代价是 CNT 不能用来做别的事（比如同时当定时器用）。
