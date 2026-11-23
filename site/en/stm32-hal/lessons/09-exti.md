# 09 · EXTI 外部中断与 HAL 回调

part: 第二篇 · GPIO 与中断
video: P57 – P63
level: 基础
lead: 轮询按键要一直占着 CPU，外部中断则让硬件替你盯着引脚：电平一变，CPU 才被叫醒。F1 的 EXTI 有 20 条线，前 16 条通过 AFIO 映射到 GPIO，后 4 条接 PVD、RTC 闹钟、USB 唤醒等内部事件。这一课把「引脚 → EXTI → NVIC → 回调」整条链走通。

goals:
- 能画出 EXTI 的触发路径，说清 AFIO 在 IO 映射里的作用
- 能解释为什么 PA0 和 PB0 不能同时做 EXTI0
- 能用 CubeMX 配出按键下降沿中断，并在 `HAL_GPIO_EXTI_Callback()` 里处理
- 能处理抖动、重复触发与「中断只进一次」的问题

stats: 20 条 EXTI 线 · 3 个配置步骤 · 1 个回调

## 一、EXTI 的路径：从引脚到 CPU

```
PA0 ─┐
PB0 ─┼─► AFIO 选择 ─► EXTI0 ─► 边沿检测 ─► NVIC ─► CPU
PC0 ─┘   （选一个）              （上升/下降/双边）
```

关键点：

- **EXTI0–EXTI15 与 GPIO 的 Px0–Px15 一一对应**：EXTI0 只能接某个端口的第 0 脚，不能接 PA1；
- **同一编号只能选一个端口**：PA0、PB0、PC0 都能连到 EXTI0，但 AFIO 的 `EXTI0[3:0]` 只能选其中一个。想同时监控 PA0 和 PB0，必须用 EXTI0 + EXTI1（不同编号）；
- **EXTI16–EXTI19** 不经过 GPIO/AFIO，直接来自 PVD、RTC 闹钟、USB 唤醒、以太网唤醒；
- **AFIO 时钟**必须使能（`__HAL_RCC_AFIO_CLK_ENABLE()`），否则映射不生效。CubeMX 会自动加。

### 边沿与挂起

EXTI 的每个通道有：

- **触发选择**：上升沿 / 下降沿 / 双边沿；
- **屏蔽位**：屏蔽后不产生请求；
- **挂起位**：事件发生后置 1，进中断后必须**软件写 1 清除**，否则会反复进中断（或不再进）。

HAL 的 `HAL_GPIO_EXTI_IRQHandler()` 已经帮你判挂起位并清除，用户回调里不用再清。

## 二、CubeMX 配置：三步

### 第 1 步：把引脚设成 EXTI

点 **PB1** → 选 `GPIO_EXTI1`。左侧 **GPIO → PB1** 里：

- GPIO mode：`External Interrupt Mode with Falling edge trigger detection`（按键按下为下降沿）；
- GPIO Pull-up/Pull-down：`Pull-up`（按键接 GND）；
- User Label：`KEY`。

### 第 2 步：开 NVIC

**NVIC → EXTI line1 interrupt** 勾 `Enabled`，抢占优先级设 6、子优先级 0（按键不需要很快）。

### 第 3 步：生成代码

CubeMX 会生成：

```c
/* gpio.c */
void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_AFIO_CLK_ENABLE();                 /* EXTI 映射必需 */

  GPIO_InitStruct.Pin  = KEY_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING; /* 下降沿中断 */
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(KEY_GPIO_Port, &GPIO_InitStruct);

  HAL_NVIC_SetPriority(EXTI1_IRQn, 6, 0);
  HAL_NVIC_EnableIRQ(EXTI1_IRQn);
}
```

`stm32f1xx_it.c` 里会自动生成：

```c
void EXTI1_IRQHandler(void)
{
  HAL_GPIO_EXTI_IRQHandler(KEY_Pin);   /* 判挂起 + 清挂起 + 调回调 */
}
```

## 三、写回调：只做轻量事

```c
/* main.c — USER CODE BEGIN 4 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == KEY_Pin) {
        static uint32_t last = 0;
        uint32_t now = HAL_GetTick();
        if (now - last < 20) return;        /* 20ms 内重复触发视为抖动 */
        last = now;

        HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
    }
}
```

要点：

- 回调的入参是「哪条 EXTI 线」，多个引脚共用回调时用 `if` 区分；
- 中断里只翻转/置标志，复杂逻辑留给主循环；
- 用时间戳做消抖，比在中断里 `HAL_Delay` 安全得多（中断里不能长等）；
- 如果按键接 3.3V，应配 `GPIO_MODE_IT_RISING` + 下拉。

## 四、实战：红外对管计数

对射式红外传感器的 DO 输出在遮挡时会产生下降沿。把 DO 接 **PB14**，配 `GPIO_EXTI14` 下降沿、上拉，回调里计数：

```c
volatile uint32_t ir_count = 0;

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == GPIO_PIN_14) {
        ir_count++;                 /* volatile：主循环会读 */
    }
}
```

主循环每秒打印一次，用 `printf` 或 OLED 显示。注意 `ir_count` 是 32 位，主循环读它时如果中断也在写，单次 32 位读在 M3 上是原子的（对齐访问），但 `ir_count++` 不是；只让中断写、主循环读，就不要在主循环里自增。

## 五、EXTI 与 NVIC 的关系

EXTI 只负责「产生请求」，能不能进 CPU 由 NVIC 决定：

| 层 | 配置 | 忘了会怎样 |
|---|---|---|
| 引脚 | GPIO_MODE_IT_xxx | 完全没中断 |
| AFIO | 时钟 + 映射 | 映射到别的端口或无效 |
| EXTI | 边沿、屏蔽、挂起 | 不触发/反复触发 |
| NVIC | 使能 + 优先级 | 有请求但 CPU 不响应 |

## 六、坑：外部中断的常见故障

| 现象 | 原因 | 修法 |
|---|---|---|
| 完全不进中断 | 没开 AFIO 时钟 / NVIC 没使能 | 检查 MSP 与 NVIC 勾选 |
| 一次按下触发很多次 | 抖动 / 没消抖 | 回调里加 20ms 时间窗 |
| 中断只进一次 | 挂起位没清 / 没重新使能 | 用 `HAL_GPIO_EXTI_IRQHandler`，不要手写空函数 |
| PA0 和 PB0 只有一个有效 | 共用 EXTI0，AFIO 只能选一个 | 换到不同编号的引脚 |
| 进了中断但 LED 不翻 | 回调函数名/签名不对 | 必须是 `void HAL_GPIO_EXTI_Callback(uint16_t)` |
| 低功耗唤醒失败 | EXTI 没配成唤醒源 | 停止模式前配 EXTI + `HAL_PWR_EnableWakeUpPin` |

## 练习

Q| 为什么 PA0 和 PB0 不能同时作为外部中断源？如果两个按键都需要中断，应该怎么接？
A| 因为两者都映射到同一条 EXTI0，而 AFIO 的 EXTI0 选择器只能选一个端口（PA/PB/PC…）。两个同时接，只有一个能进 EXTI。解决：把其中一个按键换到别的编号，例如 PA0→EXTI0、PB1→EXTI1；或者不用 EXTI，改用定时器轮询/矩阵扫描。

Q| `HAL_GPIO_EXTI_IRQHandler()` 内部做了哪几件事？如果用户直接在 `EXTI1_IRQHandler()` 里写业务而不调用它，会有什么后果？
A| 它先检查该引脚对应的 EXTI 挂起位是否置位，若置位则清除挂起位，然后调用 `HAL_GPIO_EXTI_Callback(GPIO_Pin)`。如果绕过它，挂起位不会被清除，NVIC 会认为中断仍有效，退出后立刻再次进入，表现为「中断风暴」把主程序饿死；同时 HAL 的回调也不会被调用。

Q| 按键接 GND、配下降沿触发，但按下时读到的是低电平。为什么「按下」对应下降沿？如果按键接 3.3V，应该配什么边沿？
A| 接 GND + 上拉时，松开为高、按下变低，电平从高到低的跳变就是下降沿，所以配下降沿。接 3.3V + 下拉时，松开为低、按下变高，对应上升沿。边沿选反的现象是「松开时触发、按下不触发」。

Q| 在 EXTI 回调里调用 `printf` 打印按键次数，为什么可能丢数据或死机？应该怎么改？
A| `printf` 通过 `HAL_UART_Transmit` 阻塞发送，一个短字符串也要几十微秒到几毫秒；期间同优先级/低优先级中断被挂起，串口自己的接收中断也可能丢字节。若串口中断优先级低于按键中断，还会互相拖。改法：回调里只 `count++` 或置标志，主循环统一打印；要高频日志用环形缓冲 + DMA 发送。