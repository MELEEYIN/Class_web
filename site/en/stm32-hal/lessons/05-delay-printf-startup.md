# 05 · 延时、printf 与启动过程

part: 第一篇 · HAL 与工具
video: P28 – P31 · P41 – P44
level: 基础
lead: 上一课把 1ms 心跳装好了，这一课把三件「每天都要用」的基础设施补齐：毫秒/微秒延时、串口 printf、以及从上电到 main() 之间到底发生了什么。printf 不通，调外设只能靠猜；启动过程不懂，程序跑飞时连从哪查都不知道。

goals:
- 能写出毫秒级 `HAL_Delay` 与微秒级 DWT 延时，并说清两者的适用边界
- 能把 `printf` 重定向到 USART1，解决「有输出但乱码/没输出」的常见问题
- 能解释 BOOT0/BOOT1 三种启动模式，以及启动文件到 `main()` 的调用链
- 能读 MAP 文件里的 Code/RO/RW/ZI 与栈堆，判断 RAM/Flash 是否够用

stats: 3 种延时 · 1 条 printf 链 · 3 种启动模式

## 一、延时：毫秒用 SysTick，微秒用 DWT

### 毫秒级：`HAL_Delay`

```c
void HAL_Delay(uint32_t Delay)
{
  uint32_t tickstart = HAL_GetTick();
  while ((HAL_GetTick() - tickstart) < Delay) { }
}
```

优点：简单、跨系列统一。缺点：**阻塞**，延时期间 CPU 空转；在中断里调用可能死等（SysTick 被屏蔽）；最小分辨率 1ms，且实际会比设定多 0–1ms（取决于进入时刻）。

### 微秒级：DWT 周期计数器

F1 的 Cortex-M3 有 DWT（Data Watchpoint and Trace）周期计数器，按 HCLK 计数，精度到 1/72MHz ≈ 13.9ns：

```c
/* 初始化：使能 DWT 周期计数器 */
void DWT_Delay_Init(void)
{
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;  /* 打开 trace */
    DWT->CYCCNT = 0;
    DWT->CTRL  |= DWT_CTRL_CYCCNTENA_Msk;            /* 使能计数 */
}

/* 忙等 us 微秒；72MHz 下 1us = 72 个周期 */
void DWT_Delay_us(uint32_t us)
{
    uint32_t start = DWT->CYCCNT;
    uint32_t ticks = us * (SystemCoreClock / 1000000U);
    while ((DWT->CYCCNT - start) < ticks) { }
}
```

DWT 不受中断影响，适合给 WS2812、单总线、软件 I2C 这类「微秒级时序」用；它仍然是忙等，长延时不要用它。

### 非阻塞延时：状态机

要同时做多件事，就不要「等」：

```c
static uint32_t last;
if (HAL_GetTick() - last >= 500) {
    last = HAL_GetTick();
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_8);   /* 每 500ms 干一次，不阻塞 */
}
```

## 二、printf：把标准输出接到串口

### 第 1 步：选一个串口

CubeMX 配 USART1 异步 115200-8-N-1，生成 `huart1`。确认 `usart.c` 里 `HAL_UART_MspInit()` 已配好 PA9/PA10 与时钟。

### 第 2 步：重定向 `fputc`

ARMCC（Keil MDK）默认走半主机（semihosting），需要重定向：

```c
#include <stdio.h>

/* Keil AC5/AC6 + MicroLIB 的重定向点 */
int fputc(int ch, FILE *f)
{
    uint8_t c = (uint8_t)ch;
    HAL_UART_Transmit(&huart1, &c, 1, HAL_MAX_DELAY);
    return ch;
}
```

GCC / IAR 用 `__io_putchar` 或 `_write`，写法不同但思路一样：把字符塞进串口发送函数。

### 第 3 步：勾 MicroLIB

Keil → Options → Target → 勾 **Use MicroLIB**。不勾也能跑，但标准库会拉进半主机初始化，程序可能停在 `BKPT`。

### 第 4 步：确认 C 库

`#include <stdio.h>`，并在 `main.c` 的 USER CODE 区调用 `printf("...\r\n")`。串口助手设 115200、8-N-1、**不加流控**。

| 现象 | 原因 | 修法 |
|---|---|---|
| 完全没输出 | 没重定向 / 没勾 MicroLIB | 加 `fputc`，勾 MicroLIB |
| 输出几个乱码就停 | 波特率不一致 / 时钟不对 | 两边都 115200；查 HSE 与 PLL |
| 输出 `\0` 或丢字 | 发送超时太短 / 中断里 printf | 用 `HAL_MAX_DELAY`；不要在中断里 printf |
| 程序卡在启动 | 半主机 `BKPT` | 勾 MicroLIB 或关 semihosting |

> 调试期可以把 `printf` 包一层宏，发布时一键关掉，避免每条日志都阻塞几十微秒：
> ```c
> #define LOG(fmt, ...)  printf("[%lu] " fmt "\r\n", HAL_GetTick(), ##__VA_ARGS__)
> ```

## 三、启动模式：BOOT0/BOOT1 决定从哪跑

| BOOT0 | BOOT1 | 启动区域 | 用途 |
|---|---|---|---|
| 0 | x | 主 Flash（0x08000000） | 正常运行用户程序（默认） |
| 1 | 0 | 系统存储器 | 串口 ISP 下载（内置 bootloader） |
| 1 | 1 | 内置 SRAM | 调试小程序，掉电即失 |

最小系统板必须把 BOOT0 下拉到 GND；很多板子只留跳线帽，拔掉就悬空，表现为「有时能跑、有时不跑」。做串口下载时再把 BOOT0 接 3.3V，下载完记得接回 GND 并复位。

## 四、从上电到 main()：中间发生了什么

```
上电/复位
  ├─ 内核从 0x08000000 取 MSP 初值（栈顶）
  ├─ 从 0x08000004 取 Reset_Handler 地址并跳转
  ├─ Reset_Handler（startup_stm32f103xb.s）
  │   ├─ SystemInit()          ← 配 Flash 等待周期、向量表、时钟（HAL 工程里通常不配 PLL）
  │   ├─ __main()              ← 编译器运行库：拷 .data、清 .bss、初始化栈堆
  │   └─ main()
  │       ├─ HAL_Init()        ← 复位外设、Flash 接口、SysTick
  │       ├─ SystemClock_Config()
  │       └─ MX_xxx_Init() ...
```

几个容易忽略的事实：

- 中断向量表必须在 Flash 起始处（或重映射到 SRAM），所以 `SCB->VTOR` 一般不改；
- `SystemInit()` 不等于 `SystemClock_Config()`：前者是启动文件里调的最简初始化，后者是 HAL/CubeMX 生成的完整时钟配置；
- 全局变量初值在 `.data`（有初值）和 `.bss`（零初始化）里，`__main` 负责搬运/清零；**未初始化的局部变量是随机值**。

## 五、MAP 文件：程序到底占了多少

Keil 编译后会在 `MDK-ARM/Blink/Blink.map` 里给出：

```
Total RO  Size (Code + RO Data)   12345 ( 12.06kB)
Total RW  Size (RW Data + ZI Data) 2345 (  2.29kB)
Total ROM Size (Code + RO Data + RW Data) 12500 ( 12.21kB)
```

| 段 | 含义 | 放在哪 |
|---|---|---|
| Code | 指令 | Flash |
| RO Data | `const`、字符串、常量表 | Flash |
| RW Data | 有初值的全局变量 | 初值在 Flash，运行时搬到 RAM |
| ZI Data | 零初始化全局变量 + 栈 + 堆（未用部分） | RAM |

F103C8 只有 20KB RAM。看到 `ZI Data` 接近 20KB 就要警惕：一个大数组、一帧 OLED 缓存（1KB）、一个 4KB 的 DMA 缓冲，都会把栈挤爆。栈溢出通常不报错，表现是随机死机/变量被改。

## 六、坑：printf 与启动阶段

| 现象 | 原因 | 修法 |
|---|---|---|
| printf 无输出 | 没勾 MicroLIB / 没重定向 | 补 `fputc`，勾选 MicroLIB |
| 串口有输出但全是问号 | 编码/波特率/接线错 | 检查 TX-RX 交叉、共地、波特率 |
| 程序下载后不跑，Debug 能跑 | 没勾 Reset and Run | 下载设置里勾上 |
| 一上电就 HardFault | 栈太小 / 向量表偏移 / 访问空指针 | 查 `startup` 里的 `Stack_Size`，查 MAP |
| 全局变量初值不对 | 启动文件没跑 `__main` / 自定义启动 | 用 CubeMX 生成的启动文件，别乱改 |
| 串口下载后仍跑旧程序 | BOOT0 没接回 GND | 接回 GND 再复位 |

## 练习

Q| `HAL_Delay(1)` 的实际延时为什么可能超过 1ms？在 1ms 精度不够的场合应该换什么？
A| `HAL_Delay` 以 SysTick 的 1ms 中断为基准：如果调用时刚好错过一个 tick，就要多等接近 1ms；中断被更高优先级打断时也会拉长。要求更高时：微秒级用 DWT 周期计数器；需要严格周期用硬件定时器中断/PWM；需要不阻塞用 `HAL_GetTick()` 差值做状态机。

Q| Keil 下 printf 重定向为什么必须勾 MicroLIB？不勾会发生什么？
A| Keil 的 ARM 编译器默认使用标准 C 库，标准库的底层 I/O 走半主机（semihosting），需要调试器接管 `BKPT` 指令；没有调试器时程序会停在异常。MicroLIB 是精简库，不做半主机初始化，重定向 `fputc` 后直接走串口。也可以不勾 MicroLIB 但显式关闭 semihosting（加 `__use_no_semihosting` 并实现 `_sys_exit` 等），更麻烦。

Q| BOOT0=1、BOOT1=0 时芯片从哪里启动？这个模式有什么实际用途？下载完要注意什么？
A| 从系统存储器（System Memory）启动，里面是 ST 出厂固化的 bootloader，支持 USART1/USB 等接口的 ISP 下载。用途：没有 SWD 调试器时给芯片烧程序、救砖。下载完成后必须把 BOOT0 接回 GND 并复位，否则每次上电都进 bootloader，用户程序不会运行。

Q| MAP 文件里 ZI Data 很大，但程序还能跑；换一个大数组后随机死机，最可能的原因是什么？怎么定位？
A| ZI Data 包含栈和堆的预留空间，MAP 里给出的是链接时分配的总量，不代表运行时都用满。大数组会挤占 RAM，最容易先撑爆栈（栈从 RAM 顶端向下增长，越界会改写全局变量）。定位：看 MAP 的 `Stack_Size` 与 `Heap_Size`，把大数组改成 `static`/全局并检查剩余 RAM；在调试器里看 MSP 当前值与栈底距离；或把栈加大后复现是否消失。