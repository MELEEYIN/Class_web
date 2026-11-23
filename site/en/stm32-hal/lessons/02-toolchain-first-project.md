# 02 · 工具链与第一个 HAL 工程

part: 第一篇 · HAL 与工具
video: P6 – P13 · P26 – P27
level: 入门
lead: HAL 开发的第一步不是写代码，而是把「编译器、器件包、CubeMX、下载器」四样东西装到位。这一课从装软件开始，走通「CubeMX 生成 → Keil 编译 → ST-Link 下载 → 串口看到一行字」的完整闭环；闭环一通，后面每个外设都只是换配置。

goals:
- 能独立装好 Keil MDK5、STM32F1 器件包、CubeMX 与下载器驱动
- 能新建一个 CubeMX + MDK-ARM 的 HAL 工程，并说清每个生成文件的作用
- 能用 ST-Link 下载、用 Debug 看变量与寄存器，用串口打印第一行字
- 知道 HAL 工程里哪些文件能改、哪些一改就被 CubeMX 覆盖

stats: 4 件软件 · 2 种建工程方式 · 3 种下载方式

## 一、四件套：装什么、装哪个版本

| 软件 | 作用 | 版本与要点 |
|---|---|---|
| Keil MDK5 | 编译、下载、调试 | ≥5.36；装 `Keil.STM32F1xx_DFP` 器件包，否则选不到 F103 |
| STM32CubeMX | 图形化配引脚/时钟/外设，生成 HAL 工程 | 6.x；首次用需登录 ST 账号下载 STM32CubeF1 固件包 |
| STM32CubeProgrammer | 独立下载/擦除工具（可选） | 串口 ISP、SWD 都能下；救砖时很有用 |
| 串口助手 | 看 printf / 收发数据 | 任意一款；波特率与代码一致 |

### 第 1 步：装 Keil 与器件包

装完 MDK 后打开 **Pack Installer**，在 `STMicroelectronics → STM32F1 Series` 里安装 `Keil.STM32F1xx_DFP`。没有这个包，新建工程时 Device 列表里没有 STM32F103C8，编译会报找不到启动文件。

### 第 2 步：装 CubeMX 与固件包

CubeMX 本体不大，真正占空间的是固件包。打开 **Help → Manage embedded software packages → STM32F1**，安装 `STM32CubeF1`（1.8.x）。装完后 CubeMX 才能生成 F1 的 HAL 代码；只装 CubeMX 不装固件包，生成时会提示下载。

### 第 3 步：装下载器驱动

- **ST-Link V2**：装 ST-Link USB driver；Keil 的 Debug 选 `ST-Link Debugger`，Port 选 SW。
- **DAP-Link**：装 CMSIS-DAP 驱动；Keil 里选 `CMSIS-DAP Debugger`。
- **USB 转 TTL（CH340）**：装 CH340 驱动，设备管理器里出现 COM 口即可。

> 视频 P7–P9 演示的是 DAP 下载与调试；P8 还讲了串口 ISP 下载（BOOT0=1，用 FlyMcu 通过 PA9/PA10 下载）。两种方式都值得会：SWD 能调试，串口下载能在没有调试器时救急。

## 二、建工程的两条路

### 路线 A：CubeMX 新建（推荐）

1. 打开 CubeMX → **New Project** → 搜索 `STM32F103C8` → 选 `STM32F103C8Tx`。
2. **Pinout & Configuration → System Core → RCC**：High Speed Clock (HSE) 选 `Crystal/Ceramic Resonator`。
3. **SYS**：Debug 选 `Serial Wire`（否则下载一次后可能连不上）。
4. **Clock Configuration**：在 HCLK 框输入 72，回车让 CubeMX 自动算 PLL。
5. **Project Manager**：工程名 `Blink`，Toolchain 选 `MDK-ARM`，Min Version 选你装的 Keil 版本；Code Generator 勾 `Copy only the necessary library files`。
6. **Generate Code** → Open Project。

### 路线 B：复制官方/正点原子例程

把例程的 `Core`、`Drivers`、`MDK-ARM` 整个目录复制出来，改工程名。优点是省去配时钟；缺点是工程里带着别人的板级驱动，容易看得一头雾水。建议只在「验证硬件」时用，正式学习走路线 A。

## 三、工程结构：每个文件夹是干什么的

CubeMX 生成的 MDK 工程大致长这样（以 F103C8 为例）：

| 路径 | 内容 | 能不能改 |
|---|---|---|
| `Core/Inc` | `main.h`、`gpio.h`、`usart.h` 等 | 可在 USER CODE 区加声明 |
| `Core/Src` | `main.c`、`gpio.c`、`stm32f1xx_it.c` | 只改 USER CODE 区 |
| `Drivers/STM32F1xx_HAL_Driver` | HAL 驱动 `.c/.h` | 不改（升级固件包时覆盖） |
| `Drivers/CMSIS` | 内核头文件、启动文件、系统文件 | 不改 |
| `MDK-ARM` | `.uvprojx` 工程、启动配置、输出 | 可改编译选项 |
| `Blink.ioc` | CubeMX 的配置存档 | 用 CubeMX 打开改，不要手改 |

`main.c` 的骨架是固定的：

```c
int main(void)
{
  HAL_Init();                       /* 1. 复位外设、初始化 Flash 接口与 SysTick */
  SystemClock_Config();             /* 2. 配 HSE/PLL，把主频拉到 72MHz */
  MX_GPIO_Init();                   /* 3. CubeMX 生成的外设初始化 */
  /* USER CODE BEGIN 2 */
  /* 你的初始化放这里 */
  /* USER CODE END 2 */

  while (1)
  {
    /* USER CODE BEGIN 3 */
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_8);
    HAL_Delay(500);
    /* USER CODE END 3 */
  }
}
```

**只有 `USER CODE BEGIN/END` 之间的代码会被保留**。`MX_GPIO_Init()`、`SystemClock_Config()` 都是生成区，改了重新生成就回滚。

## 四、编译、下载、调试

### 编译

Keil 里 **F7** 编译。第一次编译前确认：

- Options → Device 里是 `STM32F103C8`；
- Options → C/C++ → Define 里有 `USE_HAL_DRIVER, STM32F103xB`；
- Options → Debug 里选对调试器，Settings → Flash Download 勾 `Reset and Run`。

### 下载

**F8** 下载。常见失败与处理：

| 报错 | 原因 | 处理 |
|---|---|---|
| `No ST-LINK detected` | 驱动没装 / USB 线只供电 | 换线、重装驱动 |
| `No target connected` | SWD 线序错 / 没共地 / 芯片没供电 | 查 3.3V、GND、SWDIO、SWCLK |
| `Cannot access target` | 芯片进了低功耗或读保护 | 按住复位再点下载，或 CubeProgrammer 解保护 |
| 下载成功但不跑 | 没勾 Reset and Run / BOOT0 为高 | 勾选项；BOOT0 接 GND |

### 调试

Debug 模式下最有用的三个窗口：

- **Watch**：加变量看值，比如 `huart1.gState`、`uwTick`；
- **Peripherals → System Viewer**：直接看 GPIOA/USART1/TIM2 寄存器；
- **Call Stack + Locals**：看程序停在哪个函数、局部变量是多少。

## 五、第一个能看见现象的实验

CubeMX 里把 **PA8** 配成 `GPIO_Output`，输出电平 High，生成工程；在 `main.c` 的 `while(1)` 里写：

```c
/* USER CODE BEGIN 3 */
HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_8);   /* 翻转 PA8 */
HAL_Delay(500);                          /* 500ms，HAL 用 SysTick 计时 */
/* USER CODE END 3 */
```

再把 **USART1** 配成 Asynchronous、115200-8-N-1，PA9/PA10 自动分配，生成后在 `main.c` 里打印：

```c
/* USER CODE BEGIN 2 */
printf("HAL blink start, SYSCLK = %lu Hz\r\n", HAL_RCC_GetSysClockFreq());
/* USER CODE END 2 */
```

`printf` 需要重定向，做法见第 05 课。没有重定向时，先用 `HAL_UART_Transmit(&huart1, (uint8_t *)"hello\r\n", 7, 100)` 验证串口通不通。

## 六、坑：工程建好了却跑不起来

| 现象 | 原因 | 修法 |
|---|---|---|
| Device 里没有 F103C8 | 没装 DFP 器件包 | Pack Installer 安装 `Keil.STM32F1xx_DFP` |
| 编译报 `stm32f1xx_hal.h: No such file` | Include Paths 缺 HAL 目录 | CubeMX 生成时勾 `Copy only necessary`，Keil 里检查 Include Paths |
| 生成代码后编译报 `STM32F103xB` 未定义 | C/C++ Define 没带系列宏 | 加上 `USE_HAL_DRIVER, STM32F103xB` |
| 下载后第二次连不上 | 把 PA13/PA14 配成了普通 IO | SYS → Debug 保持 Serial Wire；用 Connect under Reset 救回 |
| 串口助手全是乱码 | 波特率不一致 / 晶振不是 8MHz | 两边都 115200；确认 HSE 频率与时钟树 |
| 重新生成后代码消失 | 写在 USER CODE 区外 | 把业务挪进 BEGIN/END 区 |

## 练习

Q| CubeMX 生成工程时，`Copy only the necessary library files` 勾与不勾有什么区别？各自适合什么场景？
A| 勾上时 CubeMX 只把本工程用到的 HAL 驱动 `.c` 文件复制进 `Drivers`，工程体积小、编译快；不勾则链接到固件包安装目录（或复制完整库），体积大但换外设不用重新生成。学习阶段建议勾上，工程自包含、换电脑也能编译；如果要做多个外设频繁迭代，也可以不勾，减少重复复制。

Q| `main.c` 里 `HAL_Init()`、`SystemClock_Config()`、`MX_GPIO_Init()` 三者的顺序能不能换？为什么？
A| 不能随便换。`HAL_Init()` 必须先做：它设置 Flash 预取/等待周期、初始化 SysTick 的时基，并调用 `HAL_MspInit()`；没有它，后面的 `HAL_Delay` 和中断都没法正常工作。`SystemClock_Config()` 必须在所有外设初始化之前：外设的波特率、定时器分频都按最终主频计算，先配外设再改主频会全错。`MX_GPIO_Init()` 依赖时钟，放在时钟配置之后。

Q| 为什么 CubeMX 生成的 `MX_USART1_UART_Init()` 里看不到 GPIO 和时钟配置？它们在哪里？
A| CubeMX 把「外设参数」放在 `MX_USART1_UART_Init()`，把「底层资源」——GPIO 复用、外设时钟、NVIC——放在 `HAL_UART_MspInit()`（在 `usart.c` 或 `stm32f1xx_hal_msp.c` 里）。`HAL_UART_Init()` 内部会调用 `HAL_UART_MspInit()`。这样分层的好处是：换引脚/换时钟只改 MSP，不动外设参数；用户也可以重写 MSP 接管底层初始化。

Q| 手上只有一块新板，没有 ST-Link，只有 USB 转 TTL。能不能把程序下载进去？步骤是什么？
A| 能，用串口 ISP（系统存储器启动）。步骤：① BOOT0 接 3.3V、BOOT1 接 GND；② 复位，芯片从 System Memory 启动，内置 bootloader 监听 USART1（PA9/PA10）；③ USB-TTL 交叉接 PA9/PA10 并共地；④ 用 FlyMcu / STM32CubeProgrammer 选串口、加载 `.hex`、开始编程；⑤ 下载完把 BOOT0 接回 GND，再复位从 Flash 启动。注意串口 ISP 不能调试，且部分板子的 BOOT1 是复用脚，接线前查原理图。