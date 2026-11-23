# 04 · 时钟树、SysTick 与系统时钟

part: 第一篇 · HAL 与工具
video: P14 – P18 · P34 – P41
level: 基础
lead: 时钟是单片机的「节拍器」：内核、总线、定时器、串口全按它计时。HAL 把所有时钟配置收进 `SystemClock_Config()`，但 CubeMX 只是替你填数，算错的后果仍然是波特率乱码、定时器差两倍、ADC 采样超速。这一课把 F1 的时钟树拆开，再把 SysTick 这个 1ms 心跳讲透。

goals:
- 能画出 8MHz HSE → PLL×9 → 72MHz → AHB/APB 分频的完整路径
- 能解释为什么 APB1 是 36MHz，而挂在 APB1 上的 TIM2/3/4 仍然是 72MHz
- 能读懂并手写 `SystemClock_Config()`，知道每个结构体成员对应哪个寄存器
- 能说清 SysTick 如何产生 1ms 中断、`uwTick` 与 `HAL_Delay` 的关系

stats: 4 个时钟源 · 3 条总线 · 1 个 SysTick

## 一、四个时钟源：先从哪儿起振

F1 有四个时钟源，CubeMX 的 RCC 页面就是让它们起振：

| 时钟源 | 频率 | 来源 | 典型用途 |
|---|---|---|---|
| HSI | 8MHz | 内部 RC | 上电默认、HSE 失效时的后备 |
| HSE | 4–16MHz（板载 8MHz） | 外部晶振 | PLL 输入，主频的基准 |
| LSI | ~40kHz | 内部 RC | 独立看门狗 IWDG、RTC 后备 |
| LSE | 32.768kHz | 外部晶振 | RTC 精确走时 |

上电复位后，芯片先跑 **HSI 8MHz**；`SystemInit()`（启动文件调用）会把时钟切到 HSE+PLL（如果 `stm32f1xx_hal_conf.h` 里 `HSE_VALUE` 与板子一致）。真正的「72MHz」是 `SystemClock_Config()` 跑完才稳定的。

## 二、时钟树：72MHz 是乘出来再分下去的

```
HSE 8MHz ──► PLL Source ──► PLL ×9 ──► SYSCLK 72MHz
                                      ├─ AHB ÷1 ──► HCLK 72MHz（内核、DMA、SRAM、Flash）
                                      ├─ APB2 ÷1 ─► PCLK2 72MHz（GPIO、AFIO、USART1、ADC1/2、TIM1、SPI1）
                                      └─ APB1 ÷2 ─► PCLK1 36MHz（USART2/3、I2C1/2、SPI2、TIM2/3/4、PWR、BKP、WWDG）
```

三条硬约束：

- **SYSCLK ≤ 72MHz**；
- **APB1 ≤ 36MHz**，所以 APB1 预分频至少 ÷2；
- **ADC 时钟 ≤ 14MHz**，ADC 预分频通常 ÷6（72/6 = 12MHz）。

> 最容易记错的一条：APB 预分频 ≠ 1 时，**定时器时钟 = PCLK × 2**。所以 TIM2/3/4 挂在 36MHz 的 APB1 上，但计数时钟是 72MHz；I2C1 没有这个翻倍，仍然是 36MHz。PWM 频率算不对，十有八九是把这两者搞混了。

## 三、CubeMX 里怎么配

1. **RCC → HSE** 选 `Crystal/Ceramic Resonator`；
2. **Clock Configuration** 页，在 **HCLK** 框输入 `72` 回车；
3. CubeMX 自动把 **PLL Source** 选为 HSE、**PLLMul** 设为 ×9、**APB1 Prescaler** 设为 ÷2、**ADC Prescaler** 设为 ÷6；
4. 看右上角的 **Clock Tree** 是否全绿；红框表示超限；
5. 生成代码后，`main.c` 里会多出 `SystemClock_Config()`。

如果板子是 12MHz 晶振，HSE 输入要改成 12，PLL 倍频改 ×6，否则会算出 108MHz 超频跑飞。**换板先量晶振**，这是最省时间的习惯。

## 四、`SystemClock_Config()` 逐行读

HAL 1.8 的 F1 代码长这样（CubeMX 生成，略有删减）：

```c
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /* 1. 选振荡器：HSE 开、PLL 源选 HSE、倍频 ×9 */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState       = RCC_HSE_ON;
  RCC_OscInitStruct.HSEPredivValue = RCC_HSE_PREDIV_DIV1;
  RCC_OscInitStruct.HSIState       = RCC_HSI_ON;
  RCC_OscInitStruct.PLL.PLLState   = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource  = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLMUL     = RCC_PLL_MUL9;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
    Error_Handler();
  }

  /* 2. 选系统时钟源与各总线分频 */
  RCC_ClkInitStruct.ClockType      = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                                   | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider  = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  /* 3. 72MHz 需要 2 个 Flash 等待周期 */
  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK) {
    Error_Handler();
  }
}
```

三个细节：

- `FLASH_LATENCY_2`：72MHz 时 Flash 取指要等 2 个周期，配错会取指错误/死机；
- `HSEPredivValue`：F1 的 PLL 输入前有一个 ÷1/÷2 预分频，8MHz 用 ÷1；
- `HAL_RCC_ClockConfig()` 内部会更新 `SystemCoreClock`，但**如果你手动改了时钟而没调这个函数，`SystemCoreClock` 还是旧值**，`HAL_Delay` 和串口都会算错。

## 五、SysTick：HAL 的 1ms 心跳

SysTick 是 Cortex-M3 内核自带的 24 位递减计数器，不属于任何外设，所以不受 APB 分频影响，始终按 HCLK 计数。

```c
/* HAL_Init() 内部会调用 HAL_InitTick(TICK_INT_PRIORITY) */
__weak HAL_StatusTypeDef HAL_InitTick(uint32_t TickPriority)
{
  /* 重装值 = 72MHz / 1000 - 1 = 71999，每 1ms 中断一次 */
  HAL_SYSTICK_Config(SystemCoreClock / (1000U / uwTickFreq));
  HAL_SYSTICK_CLKSourceConfig(SYSTICK_CLKSOURCE_HCLK);
  HAL_NVIC_SetPriority(SysTick_IRQn, TickPriority, 0U);
  return HAL_OK;
}

/* SysTick_Handler → HAL_IncTick()：每 1ms 把全局计数 +1 */
void SysTick_Handler(void)
{
  HAL_IncTick();
  HAL_SYSTICK_IRQHandler();   /* 只有用了 HAL 的 SysTick 回调才需要 */
}
```

由此得到两个最常用的函数：

| 函数 | 实现 | 用途 |
|---|---|---|
| `HAL_GetTick()` | 返回全局 `uwTick` | 非阻塞超时、状态机计时 |
| `HAL_Delay(ms)` | 记录起点，循环等 `uwTick - start >= ms` | 简单阻塞延时 |

`uwTick` 是 `uint32_t`，49.7 天溢出一次；写超时判断时用「差值」而不是「大小」：`if (HAL_GetTick() - start > 100)`，溢出也正确。

### 时基可以换

用 FreeRTOS 时，SysTick 被 RTOS 占用，CubeMX 会把 **SYS → Timebase Source** 改成 TIMx，并生成 `HAL_TIM_Base_Start_IT()`。这时 `HAL_Delay` 仍然可用（时基换成 TIM 中断），但精度与中断优先级要重新评估。

## 六、坑：时钟不对，所有外设都跟着错

| 现象 | 原因 | 修法 |
|---|---|---|
| 串口全是乱码 | HSE 实际频率与 `HSE_VALUE` 不符 / PLL 算错 | 量晶振，改 `HSE_VALUE` 和 CubeMX 时钟树 |
| 定时器周期正好差 2 倍 | APB1 预分频 ≠1 时忘了定时器时钟 ×2 | 用 `PCLK1×2` 算 PSC，或改用 `HAL_RCC_GetPCLK1Freq()*2` |
| `HAL_Delay(1000)` 不是 1 秒 | `SystemCoreClock` 没更新 | 调 `SystemCoreClockUpdate()`，或只用 `HAL_RCC_ClockConfig()` 改时钟 |
| 程序在 `Error_Handler` 停住 | HSE 起振失败（晶振/负载电容/BOOT） | 换 HSI 测试，查晶振焊接 |
| ADC 读数跳动大 | ADC 时钟超过 14MHz | ADC 预分频改 ÷6 或 ÷8 |
| 待机唤醒后串口乱码 | 停止模式唤醒后时钟回到 HSI | 唤醒后重新调 `SystemClock_Config()`（第 22 课） |

## 练习

Q| 8MHz HSE、PLL×9、AHB÷1、APB2÷1、APB1÷2 的配置下，SYSCLK、HCLK、PCLK2、PCLK1、TIM2 计数时钟、I2C1 时钟各是多少？
A| SYSCLK = 8×9 = 72MHz；HCLK = 72/1 = 72MHz；PCLK2 = 72/1 = 72MHz；PCLK1 = 72/2 = 36MHz；TIM2 挂在 APB1，APB1 预分频≠1，所以定时器时钟 = 36×2 = 72MHz；I2C1 不享受翻倍，仍是 36MHz。

Q| 为什么 72MHz 时 `HAL_RCC_ClockConfig()` 要传 `FLASH_LATENCY_2`？传 0 会怎样？
A| Flash 的读取速度跟不上 72MHz 的内核，需要插入等待周期：F1 在 48–72MHz 范围要求 2 个等待周期。传 0 表示零等待，CPU 取指时 Flash 还没准备好，会读到错误指令/总线错误，表现为随机死机或 HardFault。等待周期数与主频、供电电压有关，CubeMX 会按频率自动选，手写时不要省。

Q| `HAL_Delay(1000)` 的内部实现是什么？在中断服务函数里调用它有什么风险？
A| 它先记录 `HAL_GetTick()`，然后 `while (HAL_GetTick() - start < 1000)` 空转。`uwTick` 由 SysTick 中断每 1ms 加 1，所以延时依赖 SysTick 中断能被响应。如果在优先级不低于 SysTick 的中断里调用，SysTick 被屏蔽，`uwTick` 不再增长，程序会永远卡在 while 里（看门狗随后复位）。中断里要用非阻塞状态机或硬件定时器，不要用 `HAL_Delay`。

Q| 用 FreeRTOS 时，为什么 CubeMX 建议把 Timebase Source 从 SysTick 改成 TIM？不改会怎样？
A| FreeRTOS 要把 SysTick 用作自己的系统节拍，并在 `SysTick_Handler` 里做任务调度；HAL 的 `HAL_IncTick()` 如果和 RTOS 抢同一个中断，轻则延时不准，重则调度器节拍被覆盖。改成 TIM 后，HAL 用独立的定时器中断维护 `uwTick`，SysTick 完全归 RTOS，两者互不干扰。代价是多占一个定时器，并且这个 TIM 的中断优先级要设得比 RTOS 可管理范围高（通常最高）。