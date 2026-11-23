# 01 · 认识 STM32 与 HAL 开发方式

part: 第一篇 · HAL 与工具
video: P1 – P5
level: 入门
lead: STM32 的开发方式有三层：直接写寄存器、调标准库、用 HAL 库。HAL 不是「更高级的语言」，而是 ST 把「配哪个寄存器、按什么顺序配」封装成函数，让你把时间花在业务上。这一课先把三种写法摆在一起，弄清 HAL 的边界，再认识 F103C8T6 这颗芯片和它的最小系统。

goals:
- 能说出寄存器、标准库、HAL/LL 三种开发方式各自的优缺点和适用场景
- 能画出 CMSIS → HAL → 用户代码这三层的关系，知道 CubeMX 生成的是哪一层
- 能读懂 STM32F103C8T6 的型号、资源、引脚命名与最小系统四要素
- 知道 HAL 工程的固定节奏：CubeMX 配 → 生成代码 → 只在 USER CODE 区写业务

stats: 3 种开发方式 · 4 个最小系统要素 · 视频 P1–P5

## 一、同一颗芯片，三种写法

点一颗 LED，本质都是「把 GPIOA 的第 8 位置 0」。三种写法的差别不在硬件，而在「谁来记住寄存器地址和配置顺序」。

| 写法 | 点灯代码（核心一行） | 优点 | 代价 |
|---|---|---|---|
| 直接操作寄存器 | `GPIOA->BRR = GPIO_PIN_8;` | 最快、代码最小、完全可控 | 每个外设都要翻参考手册；换型号要重写 |
| 标准外设库 SPL | `GPIO_ResetBits(GPIOA, GPIO_PIN_8);` | 函数名直观、资料多 | ST 已停止维护，只覆盖 F1/F2/F4/L1 等老系列 |
| HAL 库 | `HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET);` | 全系列统一接口、CubeMX 自动生成、生态完整 | 多一层封装，代码略大、执行略慢 |

> 这三种写法没有「谁更专业」。HAL 适合快速做出产品、适合跨系列移植；寄存器适合抠时序、抠体积；标准库适合维护老工程。本站两门单片机课就是前两种写法的对照：[[标准库 19 课|./stm32.html]] 与这一门 HAL 24 课。

### LL 库：HAL 的「轻量版」

ST 从 CubeF1 起同时发布 **LL（Low Layer）库**，它和 HAL 捆绑在同一个固件包里，头文件以 `_ll_` 命名。LL 直接操作寄存器，效率接近手写寄存器；HAL 的很多函数内部也会调用 LL。两者的分工：

- 要**跨系列、要图形化配置、要中间件（USB/FATFS/FreeRTOS）** → 用 HAL；
- 要**极致的时序或代码体积**、又不想完全手写寄存器 → 用 LL；
- 同一个工程里可以混用：CubeMX 里把某个外设的 `Use Full LL` 打开即可。

## 二、HAL 库到底是什么

HAL = Hardware Abstraction Layer（硬件抽象层）。它不改变硬件，只是在「寄存器」和「你的代码」之间加了一层函数。这层函数遵守 ARM 的 **CMSIS** 规范，所以同一套 API 能覆盖 STM32 全系列。

| 层 | 里面有什么 | 谁维护 | 你要不要看 |
|---|---|---|---|
| CMSIS-Core | `core_cm3.h`、NVIC/SysTick 的内核访问、启动文件 | ARM | 知道有这层即可 |
| CMSIS-Device | `stm32f103xb.h`、外设寄存器结构体、中断号 | ST | 查寄存器时看 |
| HAL 驱动 | `stm32f1xx_hal_gpio.c`、`stm32f1xx_hal_uart.c`… | ST | 出问题时要看 |
| 用户代码 | `main.c`、`gpio.c`、`usart.c` 里的业务 | 你 | 天天写 |

HAL 的命名有固定规律，记住这套规律，看函数名就知道它干什么：

| 形式 | 例子 | 含义 |
|---|---|---|
| `HAL_<外设>_Init()` | `HAL_GPIO_Init()` | 用句柄里的参数初始化外设 |
| `HAL_<外设>_<动作>()` | `HAL_UART_Transmit()` | 读、写、启动、停止等动作 |
| `HAL_<外设>_<动作>_IT()` | `HAL_ADC_Start_IT()` | 中断方式版本 |
| `HAL_<外设>_<动作>_DMA()` | `HAL_UART_Receive_DMA()` | DMA 方式版本 |
| `HAL_<外设>_xxxCallback()` | `HAL_UART_RxCpltCallback()` | 弱函数，中断处理完成后回调给你 |
| `HAL_<外设>_MspInit()` | `HAL_UART_MspInit()` | 弱函数，放时钟、引脚、NVIC 等底层初始化 |
| `__HAL_<外设>_<动作>` | `__HAL_RCC_GPIOA_CLK_ENABLE()` | 宏，直接操作某一位或使能时钟 |

### 句柄与初始化结构体

HAL 每个外设都有一个**句柄**（`UART_HandleTypeDef huart1`），句柄里又嵌一个**初始化结构体**（`huart1.Init`）。CubeMX 生成的 `MX_USART1_UART_Init()` 就是「填结构体 → 调 `HAL_UART_Init()`」。理解这一点，后面所有外设都是同一个套路：

```c
UART_HandleTypeDef huart1;          /* 句柄：外设实例 + 运行状态 + 参数 */

huart1.Instance          = USART1;  /* 用哪个硬件 */
huart1.Init.BaudRate     = 115200;  /* 工作参数 */
huart1.Init.WordLength   = UART_WORDLENGTH_8B;
huart1.Init.StopBits     = UART_STOPBITS_1;
huart1.Init.Parity       = UART_PARITY_NONE;
huart1.Init.Mode         = UART_MODE_TX_RX;
huart1.Init.HwFlowCtl    = UART_HWCONTROL_NONE;
huart1.Init.OverSampling = UART_OVERSAMPLING_16;

if (HAL_UART_Init(&huart1) != HAL_OK) {
    Error_Handler();                /* 初始化失败：时钟/引脚/参数有一处不对 */
}
```

## 三、F103C8T6 的家底与最小系统

`STM32F103C8T6` 每一位都在说参数：C = 48 脚，8 = 64KB Flash，T = LQFP，6 = -40～85℃。它属于 F1 的「中容量」产品，CubeMX 里对应 `STM32F103C8Tx`。

| 资源 | 实际值 | 对 HAL 开发的影响 |
|---|---|---|
| 内核 / 主频 | Cortex-M3，72MHz | HAL 的 `HAL_Delay(1)` 精度 1ms，来自 SysTick |
| Flash / SRAM | 64KB / 20KB | CubeMX 勾「Copy only necessary」后，F1 HAL 工程约 10–20KB |
| 通用 IO | 37 个（PA0–15、PB0–15、PC13–15） | CubeMX 左侧点引脚即可分配 |
| 定时器 | TIM1 高级；TIM2/3/4 通用；TIM6/7 基本 | PWM、捕获、编码器都能练 |
| 通信 | 3×USART、2×I2C、2×SPI、1×CAN、1×USB | 第 10–11、18–19、23 课覆盖 |
| 模拟 | 2×ADC（12 位），**无 DAC** | DAC 课用 F103RC 以上或 PWM+RC 替代 |
| 调试 | SWD（PA13/PA14） | 不要把这俩配成普通 IO |

**最小系统**只保证芯片能跑，四样缺一不可：

1. **电源**：3.3V LDO + 每个电源脚 100nF 去耦；
2. **晶振**：8MHz + 两个 20pF 负载电容（HAL 的 `SystemClock_Config` 默认按 8MHz 算）；
3. **复位**：NRST 10kΩ 上拉 + 100nF 到地 + 按键；
4. **启动配置**：BOOT0 经 10kΩ 下拉到地。

再加 SWD 排针（3.3V / GND / SWDIO / SWCLK）就能下载调试。买板子重点看 BOOT0 是否有下拉、晶振是不是 8MHz——这两处不对，后面 CubeMX 的时钟树怎么配都不对。

## 四、HAL 开发的固定节奏

HAL 工程不是「从空 main.c 开始写」，而是「CubeMX 生成骨架，你只填业务」。固定节奏只有四步：

### 第 1 步：在 CubeMX 里配硬件

选芯片 → 配 RCC 时钟源（HSE 晶振）→ 配 SYS 调试口（Serial Wire）→ 点引脚设功能 → 在 Clock Configuration 里拉时钟树 → 配外设参数与 NVIC → Project Manager 选 MDK-ARM、填工程名、生成代码。

### 第 2 步：CubeMX 生成初始化代码

生成后每个外设一个 `xxx.c`（GPIO 在 `gpio.c`，串口在 `usart.c`），里面是 `MX_xxx_Init()`；`main.c` 里按 `HAL_Init()` → `SystemClock_Config()` → `MX_GPIO_Init()` → … 的顺序调用。**这些生成代码不要手改**，下次重新生成会被覆盖。

### 第 3 步：只在 USER CODE 区写业务

CubeMX 在每个函数里留了注释对：

```c
/* USER CODE BEGIN 2 */
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET);   /* 你的代码放这里 */
/* USER CODE END 2 */
```

只有 `USER CODE BEGIN/END` 之间的内容会被 CubeMX 保留。写在区间外的代码，重新生成一次就没了——这是 HAL 新手最常见的事故。

### 第 4 步：编译、下载、看现象

Keil 里 F7 编译、F8 下载；Debug 里可以打开 **Peripherals → System Viewer** 直接看 GPIO/USART/TIM 寄存器，比只读代码快得多。

## 五、视频与本页的对应

| 视频 | 内容 | 本页怎么用 |
|---|---|---|
| P1–P3 | 单片机简介、Cortex-M 系列、初识 STM32 | 建立「内核 + 总线 + 外设」的整体印象 |
| P4 | 学会查看数据手册 | 查引脚复用、电气参数、外设数量 |
| P5 | 最小系统与 IO 分配 | 对照本节第三节，确认板子能跑 |
| P23–P25 | HAL 库、框架、使用方法 | 第 03 课展开 |
| P32–P33 | CubeMX 安装与新建工程 | 第 02–03 课动手 |

> 视频里的开发板多是 F103ZE（战舰/精英板），引脚和 C8T6 不同。本页把实验统一到 C8T6：能用同名的尽量同名，不能同名的在每课开头给出「视频引脚 → 本页引脚」对照。HAL 代码本身不需要改引脚名，改的是 CubeMX 里点的那个脚。

## 六、坑：刚开始用 HAL 最容易犯的四个错

| 现象 | 原因 | 修法 |
|---|---|---|
| 改完代码重新生成，改动全没了 | 写在了 `USER CODE` 区外 | 业务只写在 BEGIN/END 之间 |
| 编译报 `HAL_GPIO_Init` 未定义 | 没把 HAL 驱动加进工程 / 器件宏不对 | CubeMX 生成时勾选对应外设；确认 `STM32F103xB` 宏 |
| 程序停在 `Error_Handler()` | 时钟或引脚配置失败，HAL 初始化返回非 `HAL_OK` | 先在 `Error_Handler` 打断点，查 `HAL_RCC_GetSysClockFreq()` |
| 下载后没现象 | 没勾 Reset and Run，或 BOOT0 被拉高 | Keil 下载设置勾 Reset and Run；BOOT0 接 GND |

## 练习

Q| HAL 库、标准库、直接写寄存器，三者的本质区别是什么？HAL 为什么能做到「全系列同一套接口」？
A| 本质区别是「谁负责把硬件动作翻译成寄存器操作」：寄存器写法由程序员直接面对地址与位；标准库用一层函数包装寄存器；HAL 在标准库之上再抽象出统一的句柄、初始化结构体与回调，把不同系列的外设差异藏在驱动内部。全系列兼容靠两层：ARM 的 CMSIS 统一内核访问，ST 的 HAL 驱动为每个系列实现同一组 API，用户代码只依赖 API 名字，不依赖寄存器地址。

Q| 句柄（HandleTypeDef）和初始化结构体（InitTypeDef）是什么关系？为什么要分成两个？
A| 句柄描述「一个外设实例的完整状态」：用哪个硬件（Instance）、当前工作参数（Init）、运行时的缓冲区指针、状态机、错误码等。InitTypeDef 只是其中「初始化参数」这一小块。分成两个是为了让运行期状态和静态配置解耦：初始化时用 Init 填参数，运行中 HAL 会改写句柄里的 State/ErrorCode，但不会动 Init；用户也可以在不重新 Init 的情况下修改某个参数再调用相应函数。

Q| 在 CubeMX 生成的工程里，为什么不能直接改 `MX_GPIO_Init()` 里的代码？如果确实需要改配置，正确做法是什么？
A| 因为 `MX_GPIO_Init()` 属于生成区，CubeMX 重新生成时会按 .ioc 文件重写整个函数，手改会丢失。正确做法是回到 CubeMX 修改引脚/参数并重新生成；如果只是运行时要改变行为（比如翻转电平、切换上下拉），在 `USER CODE` 区调用 HAL 函数，而不是改初始化代码。确实要永久改初始化，可以在 `USER CODE BEGIN` 里追加自己的配置，或在生成区外另写一个 `My_GPIO_Init()` 覆盖。

Q| 一块 C8T6 最小系统板，接上 3.3V 和 ST-Link 后程序能下载但完全不跑。按顺序先查哪三处？
A| ① BOOT0：必须为低（接 GND），否则可能从系统存储器启动，不跑用户 Flash；② 复位与供电：量 NRST 是否为高、3.3V 是否稳定，复位电容是否短路；③ 时钟：确认晶振是 8MHz、`SystemClock_Config()` 没有把 PLL 配到超频；如果程序卡在 `Error_Handler()`，就是 HSE 起振失败。三步都正常，再用 Debug 单步看是否进了 `main()`。