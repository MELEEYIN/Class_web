# 06 · EXTI 外部中断：红外计次与旋转编码器
part: 第三篇 · 中断与定时器
video: P11 – P12 · EXTI 外部中断 / 对射式红外计次、旋转编码器计次
level: 进阶
lead: 轮询是「我一遍遍问你有没有事」，中断是「有事你直接来找我」。前者把 CPU 浪费在等待上，后者把响应时间从「一圈循环」压到「几个时钟」。代价是：中断里发生的每一件事，都要有人负责收尾。
goals:
- 能画出「引脚 → AFIO → EXTI → NVIC → CPU」这条链路，并说清每一级要配什么
- 能独立配置一路下降沿中断，并在中断函数里完成计数
- 能解释抢占优先级与响应优先级的区别，知道什么时候会嵌套
- 能用 EXTI 做红外计次和旋转编码器判向
stats: 6 个小节 · 5 张表 · 4 道练习

## 一、中断链路：信号从引脚到 CPU 要走四步

一个外部电平变化要变成「CPU 跳去执行你的函数」，中间经过四道关：

| 环节 | 作用 | 要配的东西 |
| --- | --- | --- |
| GPIO | 引脚的电平 | 输入模式（上拉/下拉/浮空） |
| AFIO | **把哪个端口接到 EXTI 线上** | `GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource14)` |
| EXTI | 选触发边沿、开中断屏蔽 | `EXTI_InitTypeDef`：`EXTI_Line`、`EXTI_Mode`、`EXTI_Trigger`、`EXTI_LineCmd` |
| NVIC | 给这条中断线排优先级、使能 | `NVIC_InitTypeDef`：`NVIC_IRQChannel`、抢占/响应优先级、`NVIC_IRQChannelCmd` |

第一道关最容易忽略的细节：**EXTI 只有 16 条线（EXTI0–EXTI15），每条线对应「所有端口的同号引脚」**。也就是说 PA0、PB0、PC0 共用 EXTI0，同一时刻只能选一个端口接上去。这个「多选一」的开关就在 AFIO 的 `EXTICR` 寄存器里，所以**用 EXTI 必须先开 AFIO 时钟**：

```c
RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);
GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource14);   // 把 PB14 接到 EXTI14
```

## 二、触发方式：三种边沿

| 触发 | 什么时候触发 | 典型场景 |
| --- | --- | --- |
| 上升沿 | 低 → 高 | 按键「松开」、编码器某一相 |
| 下降沿 | 高 → 低 | 按键「按下」、红外遮挡 |
| 双边沿 | 任何变化 | 旋转编码器 A/B 相（两次变化都要数） |

对于「一端接 GND 的按键」，按下瞬间是下降沿。所以按键中断用下降沿，红外对射管被遮挡的瞬间也是下降沿（输出从高变低）。

:::warn 为什么中断里不能写 Delay_ms(20) 消抖
中断服务函数执行期间，同优先级及更低优先级的中断都进不来。在里面 `Delay_ms(20)`，等于把系统冻结 20ms——如果有串口数据在这时到达，就会丢字节（USART 只有 1 字节缓冲）。
正确做法：中断里只做「计数 / 置标志」，消抖放到主循环或定时扫描里做。第 07 课的定时中断就是干这个的。
:::

## 三、优先级：两个数字，两件事

Cortex-M3 的 NVIC 给每个中断两个优先级：**抢占优先级**（preemption）和**响应优先级**（subpriority）。规则只有两条：

- **抢占优先级高的可以打断低的**（发生嵌套）。
- **抢占优先级相同时，响应优先级高的先执行，但不能打断**（谁已经在跑就让它跑完）。

F103 的优先级是 4 位，可以自由切分成「几位给抢占、几位给响应」。常用分组是 `NVIC_PriorityGroup_2`：2 位抢占（0–3）+ 2 位响应（0–3）。

| 设置 | 抢占 | 响应 | 结果 |
| --- | --- | --- | --- |
| A: 1, 0 | 1 | 0 | 能被抢占 0 的中断打断 |
| B: 2, 0 | 2 | 0 | 优先级低于 A，不能打断 A |
| C: 1, 1 | 1 | 1 | 与 A 抢占相同 → 不能打断 A，A 结束后按响应优先级排队 |

数字越小优先级越高。这条「越小越高」和直觉相反，配反了会出现「串口中断把定时器中断饿死」这类怪现象。

## 四、五步配置 + 中断函数

```c
#include "stm32f10x.h"

uint16_t IR_Count = 0;          // 遮挡次数（中断里改，主循环里读）

void IR_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    EXTI_InitTypeDef EXTI_InitStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    /* ① 时钟：GPIOB + AFIO（用 EXTI 必须开 AFIO） */
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB | RCC_APB2Periph_AFIO, ENABLE);

    /* ② 引脚：上拉输入，遮挡时被拉低 */
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_14;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStructure);

    /* ③ 把 PB14 接到 EXTI14，并选下降沿触发 */
    GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource14);
    EXTI_InitStructure.EXTI_Line    = EXTI_Line14;
    EXTI_InitStructure.EXTI_Mode    = EXTI_Mode_Interrupt;
    EXTI_InitStructure.EXTI_Trigger = EXTI_Trigger_Falling;
    EXTI_InitStructure.EXTI_LineCmd = ENABLE;
    EXTI_Init(&EXTI_InitStructure);

    /* ④ NVIC：给 EXTI15_10 这条通道开中断 */
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = EXTI15_10_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

/* ⑤ 中断服务函数：名字必须和启动文件里的一致 */
void EXTI15_10_IRQHandler(void)
{
    if(EXTI_GetITStatus(EXTI_Line14) == SET){
        IR_Count++;                                  // 只做计数
        EXTI_ClearITPendingBit(EXTI_Line14);         // 必须清标志
    }
}
```

注意 NVIC 里的 `NVIC_IRQChannel` 填的是**中断通道**，不是 EXTI 线号。STM32 把 16 条 EXTI 线打包成了 3 个通道：`EXTI0_IRQn`、`EXTI1_IRQn`、`EXTI2_IRQn`、`EXTI3_IRQn`、`EXTI4_IRQn`、`EXTI9_5_IRQn`（5–9 共用）、`EXTI15_10_IRQn`（10–15 共用）。所以 PB14 走的是 `EXTI15_10_IRQHandler`，函数里还要再用 `EXTI_GetITStatus` 判断是哪条线——因为 10–15 共用一个入口。

## 五、旋转编码器：两次边沿判方向

旋转编码器内部是两片相位差 90° 的触点（A 相、B 相）。正转时 A 超前 B，反转时 B 超前 A。每个「咔哒」位置，两相各变化一次，所以**一个机械位置会产生两次边沿**。

最简单的判向方法：**A 相双边沿中断，读 B 相电平**。

```c
int16_t Encoder_Count = 0;

void Encoder_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    EXTI_InitTypeDef EXTI_InitStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB | RCC_APB2Periph_AFIO, ENABLE);

    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;       // 编码器是开集输出，必须上拉
    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_0 | GPIO_Pin_1;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStructure);

    /* A 相 PB0：双边沿 */
    GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource0);
    EXTI_InitStructure.EXTI_Line    = EXTI_Line0;
    EXTI_InitStructure.EXTI_Mode    = EXTI_Mode_Interrupt;
    EXTI_InitStructure.EXTI_Trigger = EXTI_Trigger_Rising_Falling;
    EXTI_InitStructure.EXTI_LineCmd = ENABLE;
    EXTI_Init(&EXTI_InitStructure);

    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = EXTI0_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

void EXTI0_IRQHandler(void)
{
    if(EXTI_GetITStatus(EXTI_Line0) == SET){
        if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_0) == 0){   // A 相下降沿
            if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1) == 1) Encoder_Count--;  // 反转
            else                                             Encoder_Count++;  // 正转
        }else{                                                // A 相上升沿
            if(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1) == 1) Encoder_Count++;
            else                                             Encoder_Count--;
        }
        EXTI_ClearITPendingBit(EXTI_Line0);
    }
}
```

方向的正负取决于 A/B 谁接哪个脚、以及编码器型号。**第一次用一定要手动转一圈确认符号**，别指望「正转就是加」。

## 六、这一课的两个坑，和它们的修法

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 编译通过、下载成功，转编码器数字完全不动 | 中断函数名写错（比如写成 `EXTI0_Handler`），弱符号没被覆盖 | 对照 `startup_stm32f10x_md.s` 里的名字；写错**不会报错**，只是永远不进 |
| 中断进一次就卡死 / 反复进 | 忘了 `EXTI_ClearITPendingBit`，标志位一直是 1 | 中断函数最后一行必须清对应线 |
| 转一格数字跳 2 或 4 | 编码器每格产生多次边沿，且抖动被计入 | 用双边沿 + 相位判向（本课做法），或改用第 10 课的硬件编码器接口 |
| 一按按键，串口就丢数据 | 按键中断里做了 `Delay_ms` 消抖 | 中断里只置标志，主循环再处理 |

:::tip 中断里该做什么，不该做什么
**该做**：读数据寄存器、置标志、计数、清中断标志。
**不该做**：`Delay`、`printf`、浮点运算（M3 无 FPU，软件模拟很慢）、动态内存分配、长循环。
判断标准：中断函数应该在**几微秒**内返回。超过 10μs 就要考虑「只置标志，主循环处理」。
:::

## 练习
Q| 为什么用 EXTI 之前必须开 AFIO 时钟？不开会怎样？
A| 因为「把哪个端口接到哪条 EXTI 线」这件事由 AFIO 的 `EXTICR` 寄存器控制。不开 AFIO 时钟，`GPIO_EXTILineConfig` 写进去的值不生效，引脚和 EXTI 线之间没有连接。
A| 现象是：GPIO 输入读得到变化（主循环轮询能看到），但中断永远不进。这类「引脚有信号、中断不响应」的问题，先查 AFIO 时钟。
Q| PA0 和 PB0 都想做外部中断，能同时用吗？为什么？
A| 不能。EXTI 只有 16 条线，`EXTI0` 只能连一个端口（PA0 或 PB0 或 PC0），由 `AFIO->EXTICR[0]` 的 4 个位选择。
A| 两个都要用，只能把其中一个改成「轮询 + 定时扫描」，或换到不同号的引脚（比如 PA0 + PB1，走 EXTI0 和 EXTI1）。
Q| 抢占优先级 1、响应优先级 0 的中断 A，正在执行时来了一个抢占 0、响应 3 的中断 B，会发生什么？
A| B 会立即打断 A（0 < 1，抢占更高），A 的现场被压栈，B 执行完再恢复 A。
A| 如果来的是一个抢占 1、响应 0 的中断 C，则不会打断 A：抢占相同不能嵌套，C 只能等 A 结束后按响应优先级排队（C 的响应 0 比 A 的 1 更优先，所以 C 排在 A 后面第一个执行）。
Q| 编码器正转时数字在减小，反转时在增大。除了交换 A/B 两根线，代码上怎么改最稳？
A| 把 `Encoder_Count++` 和 `--` 两处对调（等价于把「判向逻辑」取反），或者最终显示时取负号。
A| 推荐前者并把注释写清楚「本套件正转 = A 下降沿时 B 为低」。硬件交换线更彻底，但拆线容易接错；代码取反最安全，也不会影响后续第 10 课的硬件编码器接口（那里靠 `TIM_EncoderInterfaceConfig` 的极性参数改）。
