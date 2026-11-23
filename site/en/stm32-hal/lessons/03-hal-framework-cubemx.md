# 03 · HAL 框架与 STM32CubeMX

part: 第一篇 · HAL 与工具
video: P23 – P25 · P32 – P33
level: 入门
lead: HAL 库不是一个 `.c` 文件，而是一整套「分层 + 命名 + 回调」的约定。看懂固件包的目录、句柄与 MSP/回调三件套，再学会 CubeMX 的六个配置页，你就能预判它生成的每一行代码；反过来，出问题时也知道该去哪个文件里找。

goals:
- 能画出 STM32CubeF1 固件包的目录结构，指出 CMSIS、HAL Driver、Middlewares 各放什么
- 能说出 `HAL_xxx_Init / MspInit / Callback` 三者的调用关系，理解 `__weak` 的作用
- 能独立走完 CubeMX 的六步配置并生成 MDK 工程
- 能看懂 CubeMX 生成代码里的 USER CODE 区与 `.ioc` 存档

stats: 3 层固件包 · 6 步 CubeMX · 4 类回调

## 一、固件包长什么样

安装完 STM32CubeF1 后，固件包目录大致是：

```
STM32Cube_FW_F1_V1.8.x/
├── Drivers/
│   ├── CMSIS/                         ← ARM 内核接口 + F1 设备头文件 + 启动文件
│   │   ├── Device/ST/STM32F1xx/
│   │   │   ├── Include/               stm32f1xx.h、stm32f103xb.h、system_stm32f1xx.h
│   │   │   └── Source/Templates/      startup_stm32f103xb.s、system_stm32f1xx.c
│   │   └── Include/                   core_cm3.h、cmsis_compiler.h
│   └── STM32F1xx_HAL_Driver/
│       ├── Inc/                       stm32f1xx_hal_*.h、stm32f1xx_ll_*.h
│       └── Src/                       stm32f1xx_hal_*.c、stm32f1xx_ll_*.c
├── Middlewares/                       FreeRTOS、FatFS、USB 等（新建工程时用不到）
├── Projects/                          ST 官方板例程（参考用）
└── Utilities/
```

三个重点：

1. **CMSIS** 提供内核与芯片的「最小公共层」，启动文件、向量表、寄存器结构体都在这里；
2. **HAL Driver** 是外设驱动，每个外设一对 `.c/.h`，文件名规则见下表；
3. **Middlewares** 是可选中间件，只有做文件系统、USB、RTOS 时才用。

| 文件/函数形式 | 含义 | 例子 |
|---|---|---|
| `stm32f1xx_hal_ppp.c/h` | 某外设的 HAL 驱动 | `stm32f1xx_hal_uart.c` |
| `stm32f1xx_hal_ppp_ex.c/h` | 该外设的扩展/特殊功能 | `stm32f1xx_hal_tim_ex.c` |
| `stm32f1xx_ll_ppp.c/h` | 对应的 LL 库驱动 | `stm32f1xx_ll_gpio.c` |
| `stm32f1xx_hal.c/h` | HAL 总入口、`HAL_Init`、`HAL_Delay` | 必用 |
| `stm32f1xx_hal_conf.h` | HAL 裁剪配置：开了哪些模块、晶振频率 | 必改（HSE_VALUE） |
| `stm32f1xx_hal_msp.c` | 用户 MSP 初始化（时钟/引脚/NVIC） | CubeMX 生成 |

## 二、HAL 的「三件套」：Init、MSP、Callback

这是理解 HAL 的关键。任何一个外设的初始化都分三层：

### 第 1 层：`HAL_xxx_Init()` —— 配外设本身

用句柄里的参数写外设寄存器，例如 `HAL_UART_Init(&huart1)` 写波特率、字长、停止位、校验位。**它只关心外设，不碰 GPIO 和时钟。**

### 第 2 层：`HAL_xxx_MspInit()` —— 配底层资源

MSP = MCU Support Package。`HAL_xxx_Init()` 内部会调用它（弱函数，默认空），你要在这里放：

- 外设时钟使能：`__HAL_RCC_USART1_CLK_ENABLE()`；
- GPIO 复用与模式：`HAL_GPIO_Init()`；
- 中断优先级与使能：`HAL_NVIC_SetPriority/EnableIRQ`；
- DMA 通道配置。

CubeMX 自动生成的 `usart.c` 里就有 `HAL_UART_MspInit()`，把这几件事都写好了。

### 第 3 层：`HAL_xxx_Callback()` —— 中断/传输完成后的业务

`stm32f1xx_hal_uart.c` 里的中断服务函数只做「清标志、判类型」，然后调用弱函数回调：

```c
__weak void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  /* 空函数，等用户重写 */
}
```

你在 `main.c` 或自己的 `.c` 里重新定义同名函数，HAL 就会调用你的版本。**这就是 HAL 不用改驱动就能加业务的原因。**

```c
/* 用户重写：串口收到一个字节后自动进来 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        HAL_UART_Transmit(&huart1, &rx_byte, 1, 10);   /* 原样回显 */
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);     /* 重新挂接收 */
    }
}
```

| 回调 | 触发时机 | 常见用途 |
|---|---|---|
| `HAL_xxx_MspInit()` | `HAL_xxx_Init()` 内部 | 时钟、GPIO、NVIC、DMA |
| `HAL_xxx_MspDeInit()` | `HAL_xxx_DeInit()` 内部 | 反初始化，低功耗前关外设 |
| `HAL_xxx_xxxCallback()` | 中断/传输完成/错误 | 用户业务逻辑 |
| `HAL_xxx_ErrorCallback()` | 出错（溢出、噪声、帧错误） | 记录错误、恢复状态 |

## 三、CubeMX 的六步配置

CubeMX 的界面看着复杂，真正要动的只有六处：

### 第 1 步：选芯片

`New Project → MCU/MPU Selector`，搜 `STM32F103C8`，选 `STM32F103C8Tx`。不要选成 `STM32F103C8T6` 之外的封装变体。

### 第 2 步：配系统核心

- **RCC**：HSE 选 `Crystal/Ceramic Resonator`（板上有 8MHz 晶振）；
- **SYS**：Debug 选 `Serial Wire`；Timebase Source 默认 SysTick（用 FreeRTOS 时改 TIM）；
- **GPIO**：点引脚 → 选 `GPIO_Output` / `GPIO_Input` / 复用功能。

### 第 3 步：配时钟树

**Clock Configuration** 页，在 HCLK 框输入 72 回车，CubeMX 自动选 PLL 源、倍频和 APB 分频。要看懂每个框，去第 04 课。

### 第 4 步：配外设参数

以 USART1 为例：**Connectivity → USART1 → Mode: Asynchronous**，参数里设 115200、8 位、无校验、1 停止位；**NVIC Settings** 里勾 `USART1 global interrupt`。

### 第 5 步：Project Manager

| 选项 | 建议值 | 说明 |
|---|---|---|
| Project Name / Location | `Blink` / 自己建的空目录 | 路径不要有中文和空格 |
| Toolchain / IDE | `MDK-ARM`，Version 与你装的 Keil 一致 | 生成 `.uvprojx` |
| Code Generator | 勾 `Copy only necessary library files` | 工程自包含 |
| Generate peripheral initialization as pair of .c/.h | 勾上 | 每个外设独立文件，好维护 |
| Keep User Code when re-generating | 必勾 | 保留 USER CODE 区 |

### 第 6 步：生成并打开

点 **GENERATE CODE**。生成完点 **Open Project**，Keil 自动打开工程。之后每次改 `.ioc` 都重新生成一次，改动会合并进 USER CODE 区。

## 四、生成代码的调用链

以串口为例，把整条链串起来看：

```
main()
 ├─ HAL_Init()
 │   └─ HAL_MspInit()                  ← 系统级底层（时钟、SWD 等）
 ├─ SystemClock_Config()              ← 72MHz
 ├─ MX_GPIO_Init()                    ← GPIO 时钟 + 引脚
 ├─ MX_USART1_UART_Init()
 │   ├─ huart1.Init = ...             ← 填参数
 │   └─ HAL_UART_Init(&huart1)
 │       └─ HAL_UART_MspInit()        ← 串口时钟 + PA9/PA10 复用 + NVIC
 └─ while(1)
     └─ HAL_UART_Receive_IT()         ← 开中断接收
         └─ (收到数据) USART1_IRQHandler()
             └─ HAL_UART_IRQHandler()
                 └─ HAL_UART_RxCpltCallback()   ← 你的业务
```

看懂这条链，后面所有外设都能套：**Init 配外设、MSP 配底层、IRQHandler 清标志、Callback 写业务。**

## 五、坑：CubeMX 的坑多半在「重新生成」

| 现象 | 原因 | 修法 |
|---|---|---|
| 代码被覆盖 | 写在 USER CODE 区外 | 只改 BEGIN/END 之间；生成前先提交 git |
| 生成后多了一堆 `_ex.c` | 正常，HAL 扩展驱动 | 不用管，编译时会按需链接 |
| 编译报重复定义 | 把 `MX_xxx_Init()` 复制到了自己的文件 | 生成函数只调不改，不重复实现 |
| 改了引脚但代码没变 | 只改了 `.ioc` 没点 GENERATE | 重新生成；或检查是否打开了旧工程 |
| CubeMX 打不开 `.ioc` | 版本不兼容 | 用生成它的同版本 CubeMX；或从备份恢复 |
| 时钟树某个框是红的 | 超频或分频不合法 | 看第 04 课的频率约束，别硬拉 72MHz 以上的 APB1 |

## 练习

Q| `HAL_UART_Init()` 与 `HAL_UART_MspInit()` 的分工是什么？为什么 HAL 要把它们拆开？
A| `HAL_UART_Init()` 只写 USART 外设自己的寄存器（波特率、字长、停止位、校验、模式），属于「外设参数」；`HAL_UART_MspInit()` 负责让外设「能用」的底层条件：RCC 时钟、GPIO 复用、NVIC、DMA。拆开是为了可移植：换板子只改 MSP（引脚/时钟），外设参数和业务代码不动；同时 MSP 是弱函数，用户可以在不修改 HAL 驱动的前提下接管底层。

Q| 什么是 `__weak` 函数？如果用户不重写 `HAL_UART_RxCpltCallback()`，中断来了会发生什么？
A| `__weak` 是编译器属性，表示「这个函数可以被同名强定义覆盖」。HAL 在驱动里给每个回调一个空的弱定义；链接时如果用户提供了同名函数，就用用户的版本，否则用空的。用户不重写时，接收完成中断仍会被 HAL 清除标志并返回，只是没有任何业务动作，数据不会自动处理——看起来像「中断进了但没反应」。

Q| CubeMX 的 `Generate peripheral initialization as pair of .c/.h` 勾与不勾，生成结构有什么不同？
A| 勾上时每个外设生成独立的 `gpio.c/h`、`usart.c/h`，`main.c` 只调用 `MX_xxx_Init()`，结构清晰，适合多外设工程；不勾则所有初始化都塞进 `main.c`，文件少但很长，改起来容易冲突。建议勾上，和本站代码结构一致。

Q| 为什么 CubeMX 生成工程时要求路径不能有中文/空格？已经生成了中文路径的工程，怎么补救？
A| Keil 的编译器和 Makefile 对非 ASCII 路径、空格处理不好，容易出现找不到源文件、链接路径截断。补救：把整个工程目录移到纯英文路径（如 `D:\mcu\Blink`），用 CubeMX 重新打开 `.ioc` 并重新生成，再在 Keil 里改 Output/Listing 路径；不要只改文件夹名，工程文件里的相对路径也要跟着更新。