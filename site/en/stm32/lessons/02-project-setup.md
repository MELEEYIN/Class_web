# 02 · 建工程：Keil、标准库与第一个 main
part: 第一篇 · 起步
video: P2 – P4 · 软件安装 / 新建工程
level: 入门
lead: 标准库工程看起来几十个文件，其实只分四种角色：芯片启动与寄存器定义（不能改）、外设驱动库（基本不改）、你自己写的模块（天天改）、入口与配置（偶尔改）。把这四层分开，工程就不会越写越乱。
goals:
- 能独立从零建出一个能编译、能下载、能跑的标准库工程
- 能说清 `Start` / `Library` / `Hardware` / `User` 四个文件夹各放什么
- 记住 Keil「魔术棒」里必须改的五处设置
- 遇到「编译过但下载后不动」时，能按顺序排查
stats: 5 个小节 · 4 张表 · 4 道练习

## 一、工程的四个文件夹，各管一件事

| 文件夹 | 里面放什么 | 谁来维护 | 能不能删 |
| --- | --- | --- | --- |
| `Start` | `startup_stm32f10x_md.s`（向量表与复位入口）、`core_cm3.c/h`（内核寄存器）、`stm32f10x.h`（全部外设寄存器定义）、`system_stm32f10x.c/h`（时钟初始化） | ST 提供 | 不能，缺一个就链接不过 |
| `Library` | `misc.c`（NVIC/SysTick）+ `stm32f10x_gpio.c` / `_rcc.c` / `_tim.c` … 每个外设一个 `.c` + `stm32f10x_conf.h` | ST 提供 | 用不到的外设可以删，但删了对应的头文件也要从 `conf` 里去掉 |
| `Hardware` | `LED.c/h`、`Key.c/h`、`OLED.c/h`、`Timer.c/h`… 你自己写的外设模块 | 你 | — |
| `User` | `main.c`、`stm32f10x_it.c`（中断服务函数集中放这里，也可以自己建 `Hardware/xxx.c` 里写） | 你 | — |

这个划分不是洁癖。第 05 课开始，每加一个外设就往 `Hardware` 丢一对 `.c/.h`，`main.c` 里只留 `XXX_Init()` 和业务逻辑——一个工程写到第 19 课，`main.c` 也还是几十行。

:::tip 一个能省半小时的习惯
建好模板后**立刻复制一份存成 `Template`**，以后每节课都从这个模板复制。课程里所有工程都是同一套目录结构，换课不用重新配 Keil。
:::

## 二、Keil 里必须改的五处

新建工程后点「魔术棒（Options for Target）」，这五项错一项都跑不起来：

| 位置 | 选项 | 应填什么 | 错了的后果 |
| --- | --- | --- | --- |
| Device | 器件型号 | `STM32F103C8` | 编译出来的指令集/内存布局不对 |
| Target | Xtal (MHz) | `8.0` | 只影响仿真时序，不影响实际运行 |
| C/C++ | Define | `USE_STDPERIPH_DRIVER, STM32F10X_MD` | 用标准库却编译报「未定义 `GPIO_Init`」 |
| C/C++ | Include Paths | `Start`、`Library`、`User`、`Hardware` 四个目录 | 报 `cannot open source input file "stm32f10x.h"` |
| Debug | Use | `ST-Link Debugger`（或 CMSIS-DAP） | 下载按钮灰着，或提示 No Cortex-M Device |

外加两处建议一起勾上：`Output` 里勾 **Create HEX File**（没有 ST-Link 时能用串口下载），`Debug → Settings → Flash Download` 里勾 **Reset and Run**（否则下载完要手动按复位）。

`USE_STDPERIPH_DRIVER` 这个宏的作用是让 `stm32f10x.h` 去 `#include "stm32f10x_conf.h"`——不定义它，标准库的头文件就全部不参与编译。`STM32F10X_MD` 则告诉库「我是中容量芯片」，决定了 `stm32f10x.h` 里哪些外设的定义会生效。

## 三、第一个 main：先把骨架立住

先不管外设，把 `main.c` 写成这个结构，后面所有课都在这个骨架上加东西：

```c
#include "stm32f10x.h"                  // 器件寄存器定义（必须第一行）
#include "Delay.h"

int main(void)
{
    /* 1. 初始化：时钟由 SystemInit 配好，外设在这里逐个开 */
    LED_Init();

    /* 2. 主循环：单片机程序永远不返回 */
    while(1){
        GPIO_ResetBits(GPIOA, GPIO_Pin_0);
        Delay_ms(500);
        GPIO_SetBits(GPIOA, GPIO_Pin_0);
        Delay_ms(500);
    }
}
```

`while(1)` 不是可选项。Cortex-M3 的 `main` 一旦 `return`，会跳到启动文件里的死循环（`B .`），表现出来就是「程序跑了但外设全停」——新手常把它当成死机。

配套的 `Delay.c` 用 SysTick 做一个毫秒级延时，比 `for` 空转准得多，也不受编译器优化影响：

```c
#include "stm32f10x.h"

/* 72MHz 下 SysTick 计 72000 次 = 1ms */
void Delay_us(uint32_t us)
{
    SysTick->LOAD = 72 * us;            // 重装值 = 72 × us
    SysTick->VAL  = 0x00;               // 清当前计数
    SysTick->CTRL = 0x01;               // 使能，时钟源 = HCLK（不分频）
    while(!(SysTick->CTRL & 0x00010000));  // 等 COUNTFLAG 置位
    SysTick->CTRL = 0x00;               // 关掉，避免影响别处
}

void Delay_ms(uint32_t ms)
{
    while(ms--){
        Delay_us(1000);
    }
}
```

## 四、下载：SWD 四根线

| 板子 | ST-Link | 说明 |
| --- | --- | --- |
| 3.3V | 3.3V | 给调试器供电（板子已单独供电时可只接 GND） |
| GND | GND | 必须共地，否则认不到芯片 |
| PA13 (SWDIO) | SWDIO | 数据线 |
| PA14 (SWCLK) | SWCLK | 时钟线 |

接好后 Keil 里按 `F8` 下载。第一次下载如果提示 *No Cortex-M Device found*，先检查这四根线有没有接反（3.3V 和 GND 接反会烧调试器），再检查 `Debug → Settings → Port` 是不是选的 **SW**（不是 JTAG）。

:::warn SWD 被复用掉之后怎么救
如果程序里把 PA13/PA14 配成了普通输出，下次就连不上调试器了。救法是：**按住板子上的复位键 → 点下载 → 看到进度条开始再松手**（Keil 会在芯片复位释放的瞬间抢到 SWD）。把 `Debug → Settings → Connect` 改成 `under Reset` 也能达到同样效果。
:::

## 五、编译过但不动：按这个顺序查

| 现象 | 最可能的原因 | 一分钟验证 |
| --- | --- | --- |
| 编译 0 error，下载也成功，但没现象 | 没勾 Reset and Run，芯片还在跑旧程序 | 手动按一下复位键 |
| 下载报 `Flash Download failed - Target DLL has been cancelled` | 启动文件选错（`_md` 写成了 `_hd`）或芯片被读保护 | 检查 `.s` 文件名；用 ST-Link Utility 解除保护 |
| LED 亮但不闪 | 延时函数被编译器优化掉，或 `while(1)` 里没给外设留时间 | 把 `Delay_ms` 的参数改成变量、加 `volatile` |
| 一上电就复位 | 供电不足（USB 口带不动外设）或 BOOT0 悬空 | 换独立 3.3V 供电，BOOT0 加下拉 |
| 下载后程序跑飞，进不了 `main` | 堆栈/中断向量表被改，或 `SystemInit` 里 PLL 参数和晶振不匹配 | Debug 单步，看能否停在 `main` 第一行 |

## 练习
Q| 建工程时忘了在 C/C++ 里加 `USE_STDPERIPH_DRIVER`，会出现什么现象？为什么？
A| 现象：`GPIO_Init`、`RCC_APB2PeriphClockCmd` 等全部报「undefined symbol」，但 `#include "stm32f10x.h"` 本身不报错。
A| 原因：`stm32f10x.h` 里 `#include "stm32f10x_conf.h"` 这段被 `#ifdef USE_STDPERIPH_DRIVER` 包着。宏没定义 → 配置头文件不参与编译 → 各外设的函数声明与寄存器宏都没有 → 链接找不到符号。只有寄存器级代码（直接写 `GPIOA->ODR`）还能过。
Q| 为什么建议把中断服务函数写在 `stm32f10x_it.c` 或模块自己的 `.c` 里，而不是 `main.c`？
A| 两个理由：① 启动文件 `startup_stm32f10x_md.s` 里的向量表用的是弱符号（`WEAK`），你在任何一个 `.c` 里定义同名函数都会覆盖它，所以位置随意——但集中放便于查找；② 第 06 课起中断会越来越多（EXTI、TIM、USART、ADC），全堆在 `main.c` 会让主逻辑被淹没，按模块分文件才管得住。
Q| `Delay_us` 里最后为什么要关掉 SysTick（`SysTick->CTRL = 0x00`）？
A| 不关的话，`CTRL` 的 ENABLE 位一直是 1，SysTick 会持续重装、持续产生 COUNTFLAG；如果别处（比如 RTOS 或后面的定时器实验）也要用 SysTick，就会互相打架。
A| 另一个更隐蔽的后果：`LOAD`/`VAL` 被这次延时改过，别人再读到的就不是自己设的值了。用完即关、下次重设，是「借用」外设的基本礼貌。
Q| 用 `for(i=0;i<1000000;i++);` 做延时，为什么在 Debug 版能闪、Release 版不闪了？
A| 因为空循环没有任何副作用，编译器开优化（`-O2` 以上）会直接把它删掉，等于没有延时，LED 闪烁快到看不见（看起来像常亮）。
A| 正确做法：延时用 SysTick 或定时器（有硬件副作用，删不掉）；确实要用空循环时，循环变量加 `volatile` 并确认编译器不会优化掉。这也是第 07 课要学硬件定时器的原因之一。
