# 22 · RTC 与低功耗

part: 第六篇 · 系统与进阶
video: P129 – P134
level: 进阶
lead: 电池设备的两门必修课：一是「断电后时间不能丢」，二是「不干活时把电流压到微安」。RTC 靠备用域和纽扣电池独立走时，PWR 提供睡眠/停止/待机三级省电。这一课把 RTC 的 BCD 时间、备份域访问与三种低功耗模式串起来，并解决「唤醒后串口乱码」这个经典问题。

goals:
- 能说清 RTC 的时钟源、预分频、BCD 时间与备份域（BKP/VBAT）的关系
- 能用 `HAL_RTC_SetTime/GetTime` 读写日期时间，并判断「是否第一次上电」
- 能区分睡眠/停止/待机三种模式的功耗、唤醒源与时钟状态
- 能解决停止模式唤醒后时钟变 8MHz 导致的串口乱码

stats: 3 种低功耗模式 · 1 个备份域 · 1 个 32.768kHz

## 一、RTC：备用域里的独立时钟

```
LSE 32.768kHz ─► RTC 预分频（÷32768）─► 1Hz 秒计数 ─► BCD 日历
LSI ~40kHz  ──┘（精度差，后备）
                     │
VBAT（纽扣电池）─────┴─► 备份域供电：RTC + BKP 寄存器
```

- **RTC 时钟源**：LSE（外部 32.768kHz，精确）或 LSI（内部，约 40kHz，精度差）；
- **预分频**：`PRL` 把 32.768kHz 分成 1Hz；
- **BCD 格式**：秒/分/时/日/月/年各占一个寄存器，读写时用 `RTC_TimeTypeDef/RTC_DateTypeDef`；
- **备份域**：由 VBAT 供电，主电源掉电后 RTC 继续走；BKP 寄存器能存少量数据（如「已初始化」标记）。

### CubeMX 配置

1. **RCC → LSE** 选 `Crystal/Ceramic Resonator`（板上有 32.768kHz 晶振）；
2. **Timers → RTC**：Activate Clock Source、Activate Calendar；
3. 设置初始日期/时间（也可以代码里写）；
4. **NVIC** 如需闹钟/唤醒中断再勾；
5. 生成后 `rtc.c` 有 `MX_RTC_Init()`。

### HAL 读写时间

```c
RTC_TimeTypeDef sTime = {0};
RTC_DateTypeDef sDate = {0};

/* 写：2026-11-23 20:46:00 */
sTime.Hours   = 20;
sTime.Minutes = 46;
sTime.Seconds = 0;
HAL_RTC_SetTime(&hrtc, &sTime, RTC_FORMAT_BIN);

sDate.WeekDay = RTC_WEEKDAY_MONDAY;
sDate.Month   = RTC_MONTH_NOVEMBER;
sDate.Date    = 23;
sDate.Year    = 26;                 /* 2000 + 26 */
HAL_RTC_SetDate(&hrtc, &sDate, RTC_FORMAT_BIN);

/* 读 */
HAL_RTC_GetTime(&hrtc, &sTime, RTC_FORMAT_BIN);
HAL_RTC_GetDate(&hrtc, &sDate, RTC_FORMAT_BIN);   /* 读日期会锁存时间，必须成对读 */
```

> **必须成对读**：`HAL_RTC_GetTime` 之后要读一次 `HAL_RTC_GetDate` 解锁，否则下一次读时间可能拿到旧值。顺序不能反。

### 判断「第一次上电」

```c
if (HAL_RTCEx_BKUPRead(&hrtc, RTC_BKP_DR0) != 0xA5A5) {
    /* 第一次：设默认时间，写标记 */
    RTC_SetDefaultTime();
    HAL_RTCEx_BKUPWrite(&hrtc, RTC_BKP_DR0, 0xA5A5);
}
```

没有 VBAT 电池时，掉电后 BKP 也会丢，每次上电都算「第一次」，这是正常的。

## 二、低功耗三级：睡眠 / 停止 / 待机

| 模式 | 内核 | 时钟 | 典型电流 | 唤醒源 | 唤醒后 |
|---|---|---|---|---|---|
| Sleep | 停 | 外设继续 | mA 级 | 任意中断 | 继续执行 |
| Stop | 停 | HSI/HSE 停，LSE/LSI 可留 | 几十 µA | EXTI、RTC 闹钟 | 时钟变 HSI 8MHz，需重配 |
| Standby | 断电 | 几乎全停 | 2µA 级 | WKUP 引脚、RTC 闹钟 | 相当于复位，从头跑 |

### 进入与唤醒

```c
/* 睡眠：任何中断都能唤醒 */
HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI);

/* 停止：EXTI 唤醒，唤醒后要重配时钟 */
HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
SystemClock_Config();          /* 关键：恢复 72MHz */
MX_GPIO_Init();                /* 重新初始化被停掉的外设 */

/* 待机：唤醒等于复位 */
HAL_PWR_EnterSTANDBYMode();
```

### 唤醒源配置

- **停止模式**：用 EXTI（按键、RTC 闹钟、USART 唤醒事件）。进入前 `HAL_SuspendTick()`，唤醒后 `HAL_ResumeTick()`；
- **待机模式**：WKUP 引脚（PA0 上升沿）或 RTC 闹钟；`HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1)`。

## 三、实战：RTC 闹钟 + 停止模式

```c
/* 每秒唤醒一次，打印时间 */
RTC_AlarmTypeDef alarm = {0};
alarm.AlarmTime.Hours   = 0;
alarm.AlarmTime.Minutes = 0;
alarm.AlarmTime.Seconds = 1;
alarm.Alarm = RTC_ALARM_A;
HAL_RTC_SetAlarm_IT(&hrtc, &alarm, RTC_FORMAT_BIN);

while (1) {
    HAL_SuspendTick();
    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
    HAL_ResumeTick();
    SystemClock_Config();       /* 停止模式醒来必须先恢复时钟 */
    MX_USART1_UART_Init();      /* 串口也要重配 */
    RTC_ReadAndPrint();
}
```

## 四、坑：唤醒后串口乱码/外设失灵

| 现象 | 原因 | 修法 |
|---|---|---|
| 停止唤醒后串口乱码 | 时钟回到 HSI 8MHz，USART 仍按 72MHz 算 | 唤醒后 `SystemClock_Config()` + 重配串口 |
| RTC 每次上电归零 | 没接 VBAT / 没写 BKP 标记 | 接纽扣电池，写标记判断首次 |
| 待机后程序不跑 | 待机唤醒等于复位，需要重新初始化 | 正常，从头执行；用 BKP 保存状态 |
| 电流降不下来 | 外设没关 / GPIO 悬空 / 调试口供电 | 进低功耗前 DeInit 外设，GPIO 设模拟/输出 |
| 闹钟不触发 | RTC 时钟源没起振 / 闹钟没使能 | 查 LSE，`HAL_RTC_SetAlarm_IT` |
| 停止模式进不去 | 有中断一直挂起 / 没清标志 | 清 EXTI 挂起，关不用的中断 |

## 练习

Q| RTC 用 LSE 32.768kHz 与 LSI ~40kHz 有什么区别？为什么产品里优先选 LSE？
A| LSE 是外部晶振，频率精确（±20ppm 左右），走时误差小；LSI 是内部 RC，频率随温度/电压漂移（几十 ppm 到几百 ppm），一天可能差几秒。RTC 预分频按 32768 设计，用 LSI 还要按实际频率校正。产品要长时间准确走时，必须用 LSE + 纽扣电池。

Q| 停止模式唤醒后为什么要重新调用 `SystemClock_Config()`？不调用会怎样？
A| 停止模式会关闭 HSI/HSE 和 PLL，唤醒后系统默认回到 HSI 8MHz（或按恢复设置）。如果代码仍按 72MHz 计算波特率/定时器，实际时钟只有 8MHz，串口波特率会差 9 倍，输出全是乱码；定时器周期也全错。HAL 不会自动恢复，必须在唤醒后重配时钟，并重新初始化依赖时钟的外设。

Q| 待机模式与停止模式的本质区别是什么？为什么待机唤醒后程序像「重启」？
A| 停止模式只停时钟、保留 SRAM 和寄存器内容，唤醒后从 `WFI` 下一条继续执行；待机模式切断内核与大部分电源域，SRAM/寄存器内容丢失，唤醒相当于一次复位，程序从启动文件重新跑。所以待机适合「长时间休眠、醒来重新初始化」的场景，停止适合「短暂休眠、保持状态」的场景。

Q| 做一块电池供电的温湿度记录仪，每 10 分钟采一次数据，应该怎么组合 RTC、停止模式与看门狗？
A| 用 RTC 闹钟每 10 分钟唤醒一次；主循环采集 → 存 Flash/OLED → 进停止模式；停止前关传感器电源、GPIO 设模拟、`HAL_SuspendTick()`；唤醒后恢复时钟与外设。看门狗用 IWDG（LSI 独立），但注意停止模式下 IWDG 仍在跑，喂狗周期要覆盖唤醒后的处理时间，或在休眠前喂一次并让超时大于 10 分钟（不现实）——更常见的做法是休眠期间不依赖 IWDG，醒来后用软件检查任务是否完成。