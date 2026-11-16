# 附 · 速查表：库函数 · 接线 · 报错
part: 附录
video: 全 19 课的横向索引 · 卡住时先查这里
level: 速查
lead: 这一页不讲解原理，只做三件事：把 19 课里反复出现的库函数按外设收成一张表、把课程用到的引脚和接线列清楚、把最常见的报错按「编译期 / 下载期 / 运行期」分好类。写完代码编译不过、现象不对，先来这里对一眼。
goals:
- 能在一个地方查到某个外设的初始化、启动、读写分别用哪个函数
- 能照着接线表把 19 课的模块都接对
- 遇到报错时能先判断它是「编译」「下载」还是「运行」阶段的问题
stats: 5 张速查表 · 全课程索引

## 一、标准库函数速查

| 外设 | 初始化 | 启动 / 使能 | 读写 / 操作 |
| --- | --- | --- | --- |
| GPIO | `RCC_APB2PeriphClockCmd` + `GPIO_Init` | — | `GPIO_SetBits` / `ResetBits` / `WriteBit` / `ReadInputDataBit` |
| EXTI | `GPIO_EXTILineConfig` + `EXTI_Init` + `NVIC_Init` | `EXTI_Init` 里 `EXTI_LineCmd` | `EXTI_GetITStatus` / `EXTI_ClearITPendingBit` |
| TIM 时基 | `RCC_APB1PeriphClockCmd` + `TIM_TimeBaseInit` | `TIM_Cmd` | `TIM_SetCounter` / `TIM_GetCounter` |
| TIM 中断 | + `TIM_ITConfig` + `NVIC_Init` | `TIM_Cmd` | `TIM_GetITStatus` / `TIM_ClearITPendingBit` |
| TIM PWM | + `TIM_OC1Init`（2/3/4 对应 `TIM_OCxInit`） | `TIM_Cmd` | `TIM_SetCompare1`（2/3/4 同理） |
| TIM 捕获 | + `TIM_ICInit` | `TIM_Cmd` | `TIM_GetCapture1` / `TIM_GetCapture2` |
| TIM 编码器 | + `TIM_EncoderInterfaceConfig` | `TIM_Cmd` | `TIM_GetCounter` 取差值 |
| ADC | `RCC_ADCCLKConfig` + `ADC_Init` + `ADC_RegularChannelConfig` | `ADC_Cmd` + `ADC_SoftwareStartConvCmd` | `ADC_GetConversionValue` / `ADC_GetFlagStatus` |
| DMA | `RCC_AHBPeriphClockCmd` + `DMA_Init` | `DMA_Cmd` | `DMA_SetCurrDataCounter` / `DMA_GetFlagStatus` |
| USART | `USART_Init` | `USART_Cmd` / `USART_ITConfig` | `USART_SendData` / `USART_ReceiveData` / `USART_GetFlagStatus` |
| I2C（硬件） | `I2C_Init` | `I2C_Cmd` | `I2C_GenerateSTART` / `I2C_Send7bitAddress` / `I2C_SendData` / `I2C_ReceiveData` |
| SPI | `SPI_Init` | `SPI_Cmd` | `SPI_I2S_SendData` / `SPI_I2S_ReceiveData` / `SPI_I2S_GetFlagStatus` |
| RTC | `PWR_BackupAccessCmd` + `RCC_RTCCLKConfig` + `RTC_SetPrescaler` | `RCC_RTCCLKCmd` | `RTC_SetCounter` / `RTC_GetCounter` / `RTC_WaitForLastTask` |
| BKP | `RCC_APB1PeriphClockCmd(PWR|BKP)` + `PWR_BackupAccessCmd` | — | `BKP_WriteBackupRegister` / `BKP_ReadBackupRegister` |
| PWR | `RCC_APB1PeriphClockCmd(PWR)` | `PWR_WakeUpPinCmd` | `PWR_EnterSTOPMode` / `PWR_EnterSTANDBYMode` / `PWR_ClearFlag` |
| IWDG | `IWDG_WriteAccessCmd` + `IWDG_SetPrescaler` + `IWDG_SetReload` | `IWDG_Enable` | `IWDG_ReloadCounter` |
| WWDG | `WWDG_SetPrescaler` + `WWDG_SetWindowValue` | `WWDG_Enable` | `WWDG_SetCounter` |
| FLASH | `FLASH_Unlock` | — | `FLASH_ErasePage` / `FLASH_ProgramHalfWord` / `FLASH_Lock` |
| NVIC | `NVIC_PriorityGroupConfig` | `NVIC_Init` | — |

## 二、本课程的引脚分配

| 模块 | 引脚 | 模式 | 课次 |
| --- | --- | --- | --- |
| LED 流水灯（8 位） | PA0–PA7 | 推挽输出 | 03 |
| 蜂鸣器 | PB12 | 推挽输出 | 03 |
| 按键 KEY1 / KEY2 | PB1 / PB11 | 上拉输入 | 04 |
| 光敏传感器 DO | PB13 | 上拉输入 | 04 |
| OLED SCL / SDA | PB8 / PB9 | 开漏输出 | 05 |
| 对射式红外 DO | PB14 | 上拉输入 + EXTI14 | 06 |
| 旋转编码器 A / B | PB0 / PB1 | 上拉输入 + EXTI0 / EXTI1 | 06 |
| TIM2_CH1（呼吸灯 / PWM） | PA0 | 复用推挽 | 08 |
| TIM2_CH2（舵机 / 电机 PWMA） | PA1 | 复用推挽 | 08 |
| 电机方向 AIN1 / AIN2 | PA4 / PA5 | 推挽输出 | 08 |
| TIM3_CH1（输入捕获） | PA6 | 上拉输入 | 09 |
| TIM3_CH1 / CH2（编码器接口） | PA6 / PA7 | 上拉输入 | 10 |
| ADC 四通道 | PA0–PA3 | 模拟输入 | 11 |
| USART1 TX / RX | PA9 / PA10 | 复用推挽 / 上拉输入 | 13 |
| 软件 I2C（MPU6050） | PB8 / PB9 | 开漏输出 | 14 |
| 硬件 I2C1（MPU6050） | PB6 / PB7 | 复用开漏 | 14 |
| SPI1 CS / SCK / MISO / MOSI | PA4 / PA5 / PA6 / PA7 | 推挽 / 复用 / 上拉 / 复用 | 15 |
| WKUP（待机唤醒） | PA0 | 上升沿有效 | 17 |
| SWD 调试 | PA13 / PA14 | 复用（不要改） | 全课 |

:::warn 常见的引脚冲突
PA0 同时出现在「LED 流水灯」「PWM 呼吸灯」「ADC 通道 0」「WKUP」四处，PA1 也被舵机与 ADC 共用。做实验时**一次只接一个模块**，或者按上表把功能挪到别的通道（TIM3/TIM4 的通道、ADC 的其他通道都可以用）。
同一引脚被两个外设同时配置时，后配置的会覆盖前一个，现象是「前面那个实验突然不工作了」。
:::

## 三、报错速查：分三个阶段看

### 编译期（Keil 报 error / warning）

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `cannot open source input file "stm32f10x.h"` | Include Paths 没加 Start 目录 | 魔术棒 → C/C++ → Include Paths 补全四个目录 |
| `undefined symbol GPIO_Init` | 没定义 `USE_STDPERIPH_DRIVER`，或 `stm32f10x_gpio.c` 没加进工程 | 加宏；把库文件加到 Library 分组 |
| `L6218E: Undefined symbol SystemInit` | 缺 `system_stm32f10x.c` | 把它加进 Start 分组 |
| `error: #20: identifier "xxx" is undefined` | 用了某个外设但对应的 `.c` 没加进工程 | 加到 Library 分组 |
| `Program Size: ... exceeds ...` | 代码超过 64KB | 开优化、删无用字库，或换 CBT6 |
| `multiple definition of xxx` | 同一个函数在两个 `.c` 里都定义了 | 只留一处，头文件里用 `extern` 声明 |

### 下载期（Keil 下载失败）

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `No Cortex-M Device found` | SWD 四线接错 / 没共地 / 芯片没供电 | 查线；Debug → Settings → Port 选 SW |
| `RDDI-DAP Error` | 调试器驱动没装、USB 线只供电不传数据 | 换线、重装驱动 |
| `Flash Download failed` | 启动文件选错（`_md` / `_hd`） | 换成 `startup_stm32f10x_md.s` |
| 连上了但一写就断 | 程序里把 PA13/PA14 复用掉了 | 按住复位键点下载；或用 Connect under Reset |
| `Cannot access target` | 芯片开了读保护 | ST-Link Utility → Target → Option Bytes 解除 |

### 运行期（下载成功但现象不对）

| 现象 | 先查这一处 | 课次 |
| --- | --- | --- |
| 完全没现象 | 有没有勾 Reset and Run；`while(1)` 有没有写 | 02 |
| LED 亮但不闪 | 延时被优化掉了 | 02 |
| 按键一直显示按下 | 上拉/下拉配反 | 04 |
| 按键一次跳好几下 | 没消抖 | 04 |
| OLED 全黑 | 漏了电荷泵 `0x8D 0x14` | 05 |
| OLED 花屏 | 字模取模参数不匹配 | 05 |
| 外部中断不进 | 中断函数名写错 / 没开 AFIO 时钟 | 06 |
| 定时器周期差 2 倍 | 用了 APB1 的 36MHz 而不是 72MHz | 07 |
| 定时器一上电多进一次 | 没清更新标志 | 07 |
| PWM 没有波形 | 引脚配成了普通推挽而不是复用推挽 | 08 |
| 舵机不动 | 忘了 `TIM_OC2Init`，只配了通道 1 | 08 |
| 捕获读数乱跳 | CNT 溢出没处理 | 09 |
| 编码器数字不动 | 引脚没上拉 / 没调 `TIM_EncoderInterfaceConfig` | 10 |
| ADC 恒为 4095 | 引脚没配 `GPIO_Mode_AIN` | 11 |
| ADC 电压高时乱跳 | `value * 3300` 溢出，要转 `uint32_t` | 11 |
| DMA 数组全是 0 | 通道选错（ADC1 只能用 Channel1） | 12 |
| DMA 只搬一次 | 用了 `DMA_Mode_Normal` | 12 |
| 串口全是乱码 | 波特率/时钟源算错，或唤醒后没重配时钟 | 13 / 17 |
| 串口偶尔丢数据 | 中断里做了 `printf` 或长延时 | 13 |
| MPU6050 数据全 0 | 还在睡眠模式，没写 `0x6B = 0x01` | 14 |
| W25Q64 写不进 | 没擦除 / 没发写使能 / 没等 BUSY | 15 |
| RTC 每次上电归零 | 没写 BKP 标记 / VBAT 没电 | 16 |
| 唤醒后程序异常 | 停止模式醒来时钟变 8MHz，没调 `SystemInit` | 17 |
| 每隔 1 秒重启 | 看门狗溢出时间太短 | 18 |
| 擦 Flash 后不启动 | 擦了第 0 页 | 19 |

## 四、常用数值速查

| 需求 | 公式 | 例子 |
| --- | --- | --- |
| 定时周期 | `T = (PSC+1)(ARR+1)/fCK` | 1ms → PSC=71, ARR=999 @72M |
| PWM 频率 | `f = fCK/((PSC+1)(ARR+1))` | 1kHz → PSC=719, ARR=99 |
| PWM 占空比 | `CCR/(ARR+1)` | ARR=99, CCR=30 → 30% |
| 舵机 CCR | `5 + angle×20/180`（ARR=199，50Hz） | 90° → CCR=15 |
| 串口 BRR | `fCK/(16×baud)`，整数进高 12 位、小数×16 进低 4 位 | 9600 @72M → 0x1D4C |
| ADC 电压 | `读数 × 3.3 / 4096` | 2048 → 1.65V |
| IWDG 溢出 | `(4×2^prer)(RLR+1)/40000` | prer=4, RLR=625 → 1s |
| Flash 地址 | `0x08000000 + 页号×1024` | 页 62 → 0x0800F800 |
| 时间戳偏移 | 北京时间 = UTC + 28800 | — |

## 五、19 课之后往哪走

| 方向 | 需要补的东西 | 建议起点 |
| --- | --- | --- |
| 换 HAL 库 / CubeMX | 图形化配置、HAL API、时钟树自动生成 | 用 CubeMX 重做第 03、07、13 课 |
| FreeRTOS | 任务、队列、信号量、优先级反转 | 把「1ms 心跳 + 主循环」改成多任务 |
| 电机控制 | PID、闭环、FOC | 第 08 + 10 课组合起来做速度闭环 |
| 通信协议栈 | Modbus、CAN、MQTT | 第 13 课的数据包扩展成 Modbus 帧 |
| 低功耗产品 | 电源管理、休眠唤醒、电池估算 | 第 16 + 17 + 18 课组合 |
| 硬件设计 | 电源、去耦、PCB 布局、EMC | 自己画一块最小系统板 |

:::tip 最快的进步方式
不要「学完再做」，而是**每学一课就把它做进同一个小项目**。比如做一台「按键设置 + OLED 显示 + 串口上报 + 定时采集」的小仪器：第 05 课加显示、第 11 课加采集、第 13 课加上报、第 18 课加看门狗。19 课学完，你手上就有一个能跑的真设备，而不是 19 个互不相干的例程。
:::
