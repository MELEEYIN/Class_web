# 附录 · 速查表：HAL API · CubeMX · 报错

video: 全 24 课 · 对应视频 P1–P199
lead: 这一页不讲解原理，只做四件事：把 24 课里反复出现的 HAL 函数按外设收成一张表、把 CubeMX 的关键选项列清楚、把 C8T6 的引脚分配与常见报错分阶段整理、最后给出 199 讲的课程对照。写完代码编译不过、现象不对，先来这里对一眼。

## 一、HAL API 速查

| 外设 | 初始化 | 启动/使能 | 读写/操作 | 中断回调 |
|---|---|---|---|---|
| GPIO | `HAL_GPIO_Init` | `__HAL_RCC_GPIOx_CLK_ENABLE` | `HAL_GPIO_WritePin/ReadPin/TogglePin` | `HAL_GPIO_EXTI_Callback` |
| EXTI | `HAL_GPIO_Init`（IT 模式） | `HAL_NVIC_EnableIRQ` | `HAL_GPIO_EXTI_IRQHandler` | `HAL_GPIO_EXTI_Callback` |
| NVIC | `HAL_NVIC_SetPriorityGrouping` | `HAL_NVIC_EnableIRQ` | `HAL_NVIC_SetPriority/DisableIRQ` | — |
| USART | `HAL_UART_Init` | `HAL_UART_Receive_IT/DMA` | `HAL_UART_Transmit/Receive` | `HAL_UART_RxCpltCallback` |
| I2C | `HAL_I2C_Init` | `HAL_I2C_Master_Transmit_IT` | `HAL_I2C_Mem_Write/Mem_Read` | `HAL_I2C_MemTxCpltCallback` |
| SPI | `HAL_SPI_Init` | `HAL_SPI_Transmit_DMA` | `HAL_SPI_Transmit/Receive/TransmitReceive` | `HAL_SPI_TxRxCpltCallback` |
| TIM 时基 | `HAL_TIM_Base_Init` | `HAL_TIM_Base_Start_IT` | `__HAL_TIM_SET_COUNTER` | `HAL_TIM_PeriodElapsedCallback` |
| TIM PWM | `HAL_TIM_PWM_Init` | `HAL_TIM_PWM_Start` | `__HAL_TIM_SET_COMPARE` | — |
| TIM 互补 | 同上 | `HAL_TIMEx_PWMN_Start` | `__HAL_TIM_MOE_ENABLE` | `HAL_TIMEx_BreakCallback` |
| TIM 捕获 | `HAL_TIM_IC_Init` | `HAL_TIM_IC_Start_IT` | `HAL_TIM_ReadCapturedValue` | `HAL_TIM_IC_CaptureCallback` |
| ADC | `HAL_ADC_Init` | `HAL_ADC_Start` / `Start_DMA` | `HAL_ADC_PollForConversion/GetValue` | `HAL_ADC_ConvCpltCallback` |
| DAC | `HAL_DAC_Init` | `HAL_DAC_Start` | `HAL_DAC_SetValue` | `HAL_DAC_ConvCpltCallbackCh1` |
| DMA | `HAL_DMA_Init` | `HAL_DMA_Start_IT` | `__HAL_DMA_GET_COUNTER` | `HAL_DMA_XferCpltCallback` |
| RTC | `HAL_RTC_Init` | `HAL_RTC_SetAlarm_IT` | `HAL_RTC_SetTime/GetTime` | `HAL_RTC_AlarmAEventCallback` |
| PWR | — | `HAL_PWR_EnterSTOPMode` | `HAL_PWR_EnableWakeUpPin` | — |
| IWDG | `HAL_IWDG_Init` | 初始化即启动 | `HAL_IWDG_Refresh` | — |
| WWDG | `HAL_WWDG_Init` | 初始化即启动 | `HAL_WWDG_Refresh` | `HAL_WWDG_EarlyWakeupCallback` |
| CAN | `HAL_CAN_Init` | `HAL_CAN_Start` | `HAL_CAN_AddTxMessage/GetRxMessage` | `HAL_CAN_RxFifo0MsgPendingCallback` |
| FLASH | `HAL_FLASH_Unlock` | — | `HAL_FLASHEx_Erase/Program` | — |

## 二、CubeMX 配置项速查

| 位置 | 选项 | 推荐值/说明 |
|---|---|---|
| System Core → RCC | HSE | Crystal/Ceramic Resonator（板载 8MHz） |
| System Core → RCC | LSE | Crystal/Ceramic Resonator（RTC 用） |
| System Core → SYS | Debug | Serial Wire（否则可能锁下载） |
| System Core → SYS | Timebase | SysTick（用 RTOS 时改 TIM） |
| Clock Configuration | HCLK | 72MHz，回车自动算 PLL |
| GPIO | Mode | Input/Output/AF/AN，按第 06 课选 |
| GPIO | User Label | 起名后生成 `LED_Pin/LED_GPIO_Port` |
| NVIC | 优先级 | 时基 0、串口 2–4、按键 6–10 |
| TIM | Prescaler / Period | 按公式算，注意 16 位上限 |
| TIM | auto-reload preload | Enable（改 ARR 无毛刺） |
| ADC | Clock Prescaler | ÷6（12MHz ≤ 14MHz） |
| ADC | Scan/Continuous | 单通道关，多通道开扫描 |
| DMA | Mode | 连续采集 Circular，单次 Normal |
| I2C | Speed Mode | Fast Mode 400kHz |
| SPI | CPOL/CPHA | 多数器件模式 0 |
| Project Manager | Toolchain | MDK-ARM，版本匹配 Keil |
| Code Generator | Copy only necessary | 勾上，工程自包含 |
| Code Generator | Keep User Code | 必勾 |

## 三、引脚分配（C8T6 + 本课程）

| 模块 | 引脚 | 模式 | 课次 |
|---|---|---|---|
| LED | PA8 | 推挽输出 | 07 |
| 按键 | PB1 | 输入上拉 / EXTI1 | 07、09 |
| 红外对管 DO | PB14 | 输入上拉 / EXTI14 | 09 |
| USART1 TX/RX | PA9 / PA10 | 复用 / 浮空输入 | 10、11 |
| TIM2_CH1 PWM（呼吸灯） | PA0 | 复用推挽 | 14 |
| TIM2_CH2 PWM（舵机） | PA1 | 复用推挽 | 14 |
| TIM3_CH1 捕获 / PWM 输入 | PA6 | 输入 / 复用 | 15、17 |
| I2C1 SCL/SDA | PB6 / PB7 | 复用开漏 | 18 |
| SPI1 SCK/MISO/MOSI | PA5 / PA6 / PA7 | 复用 | 19 |
| SPI1 CS | PA4 | 推挽输出 | 19 |
| ADC1_IN0 | PA0 | 模拟 | 21 |
| TIM1_CH1 / CH1N | PA8 / PB13 | 复用推挽 | 16 |
| RTC 晶振 | PC14 / PC15 | LSE | 22 |
| CAN RX/TX | PA11 / PA12 | 复用 | 23 |
| SWD | PA13 / PA14 | 复用（勿改） | 全课 |

> PA0 同时出现在 PWM、ADC、WKUP 三处，PA8 同时是 LED 与 TIM1_CH1；做实验时一次只接一个功能，或按上表换通道。

## 四、报错速查：分三个阶段看

### 编译期

| 报错 | 原因 | 处理 |
|---|---|---|
| `stm32f1xx_hal.h: No such file` | Include Paths 缺 HAL 目录 | 检查 CubeMX 生成与 Keil Include Paths |
| `identifier "GPIO_InitTypeDef" undefined` | 没包含 `main.h`/HAL 头 | `#include "main.h"` |
| `undefined symbol HAL_GPIO_Init` | HAL 驱动没加进工程 / 宏不对 | 确认 `USE_HAL_DRIVER, STM32F103xB` |
| `region RAM overflowed` | RAM 超 20KB | 减小数组/栈，查 MAP |
| `region FLASH overflowed` | Flash 超 64KB | 开优化，删无用字库 |
| `multiple definition` | 函数在两个 .c 都实现 | 只留一处，头文件用 extern |

### 下载期

| 报错 | 原因 | 处理 |
|---|---|---|
| `No ST-LINK detected` | 驱动/USB 线 | 换线、重装驱动 |
| `No target connected` | SWD 线序/共地/供电 | 查 3.3V、GND、SWDIO、SWCLK |
| `Cannot access target` | 低功耗/读保护 | Connect under Reset，CubeProgrammer 解保护 |
| 下载成功不运行 | 没勾 Reset and Run / BOOT0 高 | 勾选项，BOOT0 接 GND |
| 串口 ISP 失败 | BOOT0 没拉高 / 波特率 | BOOT0=1，选 115200，复位后下载 |

### 运行期

| 现象 | 先查 | 课次 |
|---|---|---|
| 完全没现象 | 时钟/BOOT0/Reset and Run | 01、02 |
| `HAL_Delay` 卡死 | 在中断里调用 / SysTick 被屏蔽 | 04、08 |
| 串口乱码 | 波特率、PCLK2、HSE | 10 |
| 串口只收一字节 | 没重新 `Receive_IT` | 11 |
| 定时器差 2 倍 | 定时器时钟按 36MHz 算 | 04、13 |
| PWM 无波形 | 没启动 / 配成普通输出 | 14 |
| 捕获乱跳 | 溢出没补偿 / 没滤波 | 15 |
| 互补脚无输出 | 没 `PWMN_Start` | 16 |
| OLED 全黑 | 漏电荷泵 `0x8D 0x14` | 18 |
| MPU6050 全 0 | 还在睡眠 | 18 |
| W25Q64 读 0xFF | 没擦除/没写使能/模式错 | 19 |
| DMA 只搬一次 | Normal 模式 | 20 |
| ADC 恒 4095 | 引脚没配模拟/超压 | 21 |
| 唤醒后乱码 | 停止模式后没重配时钟 | 22 |
| CAN 收不到 | 过滤器/收发器/终端电阻 | 23 |
| IAP 跳转死机 | 没设 VTOR/MSP | 24 |

## 五、公式速查

| 需求 | 公式 | 例子 |
|---|---|---|
| 定时周期 | `T=(PSC+1)(ARR+1)/fCK` | 1ms @72M：PSC=71、ARR=999 |
| PWM 频率 | `f=fCK/((PSC+1)(ARR+1))` | 1kHz：PSC=71、ARR=999 |
| PWM 占空比 | `CCR/(ARR+1)` | ARR=999、CCR=300 → 30% |
| 舵机 CCR | `500+angle×2000/180`（20ms 周期，1µs 计数） | 90° → 1500 |
| 串口 BRR | `USARTDIV=fCK/(16×baud)`，整数<<4 + 小数×16 | 115200@72M → 0x271 |
| ADC 电压 | `raw×VREF/4096` | 2048 → 1.65V（3.3V） |
| IWDG 超时 | `(4×2^PR)(RLR+1)/40000` | PR=4、RLR=1250 → 2s |
| WWDG 超时 | `4096×2^WDGTB×(0x3F+1)/PCLK1` | 58ms（÷8@36M） |
| 死区 DTG | `tDTS=1/72MHz`；1µs → 72 | 0x48 |
| CAN 位时间 | `Tq×（1+BS1+BS2）` | 500kbps 按 16Tq 分 |

## 六、199 讲对照表

| 视频范围 | 内容 | 本页课次 |
|---|---|---|
| P1–P5 | 单片机简介、Cortex-M、初识 STM32、数据手册、最小系统 | 01 |
| P6–P13 | MDK、DAP/串口下载、调试、编辑技巧、C 语言复习 | 02 |
| P14–P22 | 系统架构、存储器/寄存器映射、新建寄存器工程 | 04 |
| P23–P27 | HAL 库、框架、使用方法、新建 HAL 工程 | 02、03 |
| P28–P33 | MAP 文件、启动模式/过程、CubeMX 安装与建工程 | 02、03、05 |
| P34–P44 | 时钟树、系统时钟函数、SysTick、延时、printf | 04、05 |
| P45–P52 | GPIO 简介/结构/八种模式/寄存器/配置/点灯/按键 | 06、07 |
| P53–P63 | 中断、NVIC、优先级、EXTI、HAL 回调、外部中断实验 | 08、09 |
| P64–P75 | 通信基础、RS-232、USART 框图/波特率/寄存器/配置/实验 | 10、11 |
| P76–P85 | IWDG、WWDG 原理/寄存器/配置/实验/对比 | 12 |
| P86–P100 | 定时器概述、基本定时器、通用定时器、PWM、输入捕获、脉冲计数 | 13、14、15 |
| P101–P113 | 高级定时器、重复计数、输出比较、互补/死区、PWM 输入 | 16、17 |
| P114–P116 | 电容触摸、OLED、MPU6050 | 18 |
| P117–P128 | FMC-LCD/SDRAM/SRAM/NAND、LTDC、USMART（F4/F7 板级） | 24（选读） |
| P129–P134 | RTC、RNG、低功耗 | 22 |
| P135–P136 | DMA | 20 |
| P137–P143 | ADC（4 讲）、DAC（3 讲） | 21 |
| P144–P151 | IIC、IO 扩展、光环境、磁力计、六轴传感器 | 18 |
| P152–P155 | SPI、QSPI | 19、24 |
| P156–P168 | RS485、CAN、触摸、遥控、手柄、DS18B20、DHT11、无线 | 23 |
| P169–P170 | FLASH 模拟 EEPROM | 19 |
| P171–P175 | OV7725/OV2640/OV5640 摄像头 | 24（选读） |
| P176–P199 | 内存管理、SD 卡、FATFS、汉字/图片/视频、音频、FPU/DSP、手写/拼音、IAP、USB | 24 |

> 视频以 F103ZE（战舰/精英板）为主，部分外设（FMC、LTDC、摄像头、音频 Codec）C8T6 没有或资源不够，本页标为「选读」，只保留原理与路线。基础篇的寄存器/启动/MAP 内容与 HAL 课互补，想深入可对照 [[标准库课程|./stm32.html]]。

## 七、同一外设，两种写法对照

| 外设 | 标准库（19 课） | HAL（本页） |
|---|---|---|
| GPIO 输出 | `GPIO_SetBits/ResetBits` | `HAL_GPIO_WritePin` |
| GPIO 输入 | `GPIO_ReadInputDataBit` | `HAL_GPIO_ReadPin` |
| 外部中断 | `EXTI_Init` + `EXTI_GetITStatus` | `HAL_GPIO_EXTI_Callback` |
| 定时中断 | `TIM_TimeBaseInit` + `TIM_ITConfig` | `HAL_TIM_Base_Start_IT` + 回调 |
| PWM | `TIM_OCxInit` + `TIM_SetComparex` | `HAL_TIM_PWM_Start` + `__HAL_TIM_SET_COMPARE` |
| 输入捕获 | `TIM_ICInit` + `TIM_GetCapturex` | `HAL_TIM_IC_Start_IT` + 回调 |
| 串口 | `USART_Init` + `USART_SendData` | `HAL_UART_Init` + `HAL_UART_Transmit` |
| I2C | `I2C_Init` + 一堆状态判断 | `HAL_I2C_Mem_Read/Write` |
| SPI | `SPI_Init` + `SPI_I2S_SendData` | `HAL_SPI_Transmit/Receive` |
| ADC | `ADC_Init` + `ADC_GetConversionValue` | `HAL_ADC_Start/GetValue` |
| DMA | `DMA_Init` + `DMA_Cmd` | `HAL_DMA_Start_IT` / 外设 `_DMA` |
| RTC | `RTC_SetCounter/GetCounter` | `HAL_RTC_SetTime/GetTime` |
| 看门狗 | `IWDG_Enable/ReloadCounter` | `HAL_IWDG_Init/Refresh` |
| FLASH | `FLASH_ErasePage/ProgramHalfWord` | `HAL_FLASHEx_Erase/Program` |

## 八、学完之后

| 方向 | 需要补 | 建议 |
|---|---|---|
| 做产品 | 低功耗、看门狗、IAP、EMC | 把第 12 + 22 + 24 课组合成一台完整设备 |
| 上 RTOS | 任务/队列/信号量 | CubeMX 加 FreeRTOS，拆第 13 课的定时任务 |
| 电机控制 | PID、FOC、编码器 | 第 14 + 15 + 16 课组合 |
| 图形界面 | LVGL/TouchGFX | 换 F4/F7 + LCD，HAL 直接支持 |
| 找工作 | 通信协议、Linux 驱动 | 把 CAN/Modbus 做深，再补操作系统 |

> 最快的进步方式：不要「学完再做」，而是每学一课就把它做进同一个小项目——按键设置 + OLED 显示 + 串口上报 + 定时采集 + 看门狗。24 课学完，你手上就有一台能跑的真设备。