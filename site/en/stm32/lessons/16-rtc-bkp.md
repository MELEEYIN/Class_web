# 16 · Unix 时间戳与 RTC / BKP：断电也不丢的时间
part: 第六篇 · 系统与可靠性
video: P41 – P43 · Unix 时间戳 / BKP 与 RTC / 读写备份寄存器与实时时钟
level: 进阶
lead: RTC 就是一个「每秒自动加一的 32 位计数器」，BKP 是一小块「主电源断了还活着」的寄存器。把它们放在一起，你就得到了一个掉电不丢的时间——代价是必须自己把「秒数」翻译成「年月日时分秒」。
goals:
- 能用时间戳解释「为什么单片机里不存年月日，只存一个整数」
- 能手算闰年、月份天数，把时间戳与日期互相转换
- 能配好 RTC（LSE + 预分频）并让它在断电后继续走
- 知道备份域（BKP）为什么必须先开 PWR 时钟才能写
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、时间戳：用一个整数表示一个时刻

Unix 时间戳 = **从 1970-01-01 00:00:00 UTC 起，经过的秒数**。

| 时刻 | 时间戳 | 说明 |
| --- | --- | --- |
| 1970-01-01 00:00:00 UTC | 0 | 起点（Epoch） |
| 2000-01-01 00:00:00 UTC | 946684800 | 约 30 年 |
| 2026-11-16 00:00:00 UTC | 1794700800 | 约 56.8 年 |
| 2038-01-19 03:14:07 UTC | 2147483647 | **32 位有符号整数上限（2038 问题）** |
| 2106-02-07 06:28:15 UTC | 4294967295 | 32 位无符号上限 |

用一个整数表示时刻，好处是：比较大小、算间隔、存进 Flash，全都是一句减法。代价是显示时要自己换算成年月日。

:::warn 时区差 8 小时
时间戳永远是 UTC。北京时间 = UTC + 8 小时 = 时间戳 + 28800 秒。
如果显示的时间总是差 8 小时，不是 RTC 不准，是换算时忘了加 28800。反过来，如果「设置时间」时加了 28800、读的时候又加一次，就会差 16 小时。
:::

## 二、时间戳 ↔ 日期：闰年是唯一的坑

从时间戳算日期，就是把秒数一年一年、一月一月地减下去：

| 步骤 | 做法 |
| --- | --- |
| 年 | 从 1970 开始，每年减 365 或 366 秒数，减不动为止 |
| 月 | 用 12 个月的天数表，逐月减 |
| 日时分秒 | 剩下的秒数整除 86400 得日，余数再拆时、分、秒 |
| 闰年规则 | 能被 4 整除且不能被 100 整除，或能被 400 整除 |

月天数表：`{31, 28/29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}`。二月在闰年是 29 天——**这是唯一需要特殊处理的地方**，其他地方都是固定值。

```c
typedef struct {
    uint16_t year;
    uint8_t  month, day, hour, minute, second;
} MyTime;

uint8_t Is_Leap(uint16_t y)
{
    return (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
}

/* 时间戳 → 日期（不考虑时区，需要北京时间就先用 ts + 28800 再调） */
void Timestamp_To_Time(uint32_t ts, MyTime *t)
{
    static const uint8_t mdays[12] = {31,28,31,30,31,30,31,31,30,31,30,31};
    uint32_t days = ts / 86400;
    uint32_t secs = ts % 86400;
    uint16_t y = 1970;
    uint8_t  m = 0;

    t->hour   = secs / 3600;
    t->minute = secs % 3600 / 60;
    t->second = secs % 60;

    while(1){
        uint16_t yd = Is_Leap(y) ? 366 : 365;
        if(days < yd) break;
        days -= yd;
        y++;
    }
    t->year = y;

    for(m = 0; m < 12; m++){
        uint8_t md = mdays[m] + ((m == 1 && Is_Leap(y)) ? 1 : 0);
        if(days < md) break;
        days -= md;
    }
    t->month = m + 1;
    t->day   = days + 1;        // days 是从 0 开始的
}
```

反过来（日期 → 时间戳）就是把同样的事做加法。这一段建议自己写一遍——写完就再也不会记错闰年规则。

## 三、RTC：一个 32 位秒计数器

STM32 的 RTC 不是「年月日时分秒寄存器」，而是**一个 32 位的秒计数器**（`RTC_CNT`），每来一个 1Hz 时钟加一。它有三种时钟源：

| 时钟源 | 频率 | 精度 | 说明 |
| --- | --- | --- | --- |
| LSE（外部 32.768kHz 晶振） | 32.768kHz | 高（取决于晶振） | 首选，配 6pF 负载电容 |
| LSI（内部 RC） | 约 40kHz | 差（±50% 起振误差，温漂大） | 省晶振，但一天能差几分钟 |
| HSE/128 | 8MHz/128 = 62.5kHz | 高（主晶振） | 主电源断电就停，不适合做 RTC |

选 LSE 后，预分频设成 **32767**（即 ÷32768），得到精确的 1Hz：

**1Hz = 32768Hz / (PRL + 1)　→　PRL = 32767**

```c
void MyRTC_Init(void)
{
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR | RCC_APB1Periph_BKP, ENABLE);
    PWR_BackupAccessCmd(ENABLE);          // ① 打开备份域写权限（必须！）

    if(BKP_ReadBackupRegister(BKP_DR1) != 0xA5A5){
        /* ② 第一次上电（或备份域被清）：重新配置 */
        RCC_LSEConfig(RCC_LSE_ON);
        while(RCC_GetFlagStatus(RCC_FLAG_LSERDY) == RESET);   // 等 LSE 起振

        RCC_RTCCLKConfig(RCC_RTCCLKSource_LSE);
        RCC_RTCCLKCmd(ENABLE);

        RTC_WaitForSynchro();             // 等 RTC 寄存器与 APB1 同步
        RTC_WaitForLastTask();

        RTC_SetPrescaler(32767);          // 32768 / 32768 = 1Hz
        RTC_WaitForLastTask();

        MyRTC_SetTime(2026, 11, 16, 12, 0, 0);
        BKP_WriteBackupRegister(BKP_DR1, 0xA5A5);   // ③ 打个标记，下次不再重配
    }else{
        /* 备份域还在，RTC 一直在走，什么都不用做 */
    }
}

uint32_t MyRTC_GetCounter(void)
{
    return RTC_GetCounter();
}

void MyRTC_SetCounter(uint32_t ts)
{
    RTC_SetCounter(ts);
    RTC_WaitForLastTask();
}
```

`BKP_DR1` 里那个 `0xA5A5` 是**整个流程的关键**：它记录「RTC 已经配过了」。没有它，每次上电都会把时间重置成 2026-11-16，断电就白搭。

## 四、BKP：备份域里那 20 个字节

| 项目 | 规格 | 说明 |
| --- | --- | --- |
| 备份寄存器 | 16 位 × 10 个（BKP_DR1–DR10），部分型号 42 个 | 每个 16 位，共 20 字节 |
| 供电 | VBAT（纽扣电池）或 VDD | 主电源断了自动切到 VBAT |
| 访问前提 | 开 PWR 时钟 + `PWR_BackupAccessCmd(ENABLE)` | 少一步，写不进去也不报错 |
| 会被清空的情况 | 备份域复位（`BKP_DeInit`）、VBAT 断电、下载时勾了「全片擦除」 | 所以标记要能容错 |

BKP 的用途不止存标记，还能存「校准值」「开机次数」「上次的配置参数」——任何「掉电不能丢、但又不是每秒都变」的小数据都适合。

## 五、每秒中断：让时间「动」起来

有了秒计数，可以开 RTC 秒中断，每秒刷新一次显示：

```c
void MyRTC_IRQ_Init(void)
{
    NVIC_InitTypeDef NVIC_InitStructure;

    RTC_ITConfig(RTC_IT_SEC, ENABLE);
    RTC_WaitForLastTask();

    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    NVIC_InitStructure.NVIC_IRQChannel = RTC_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

void RTC_IRQHandler(void)
{
    if(RTC_GetITStatus(RTC_IT_SEC) != RESET){
        RTC_ClearITPendingBit(RTC_IT_SEC);       // 必须清
        RTC_WaitForLastTask();
        /* 这里只置标志，显示放主循环 */
    }
}
```

注意 `RTC_WaitForLastTask()` 这个调用：RTC 寄存器挂在 APB1 上，但 RTC 本体跑在 LSE 域，写操作是异步的。不等同步就连续写，后一次可能被丢弃——这是「设置了时间但没生效」的常见原因。

## 六、坑：时间不走、断电归零、差 8 小时

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 时间一直不走 | LSE 没起振（晶振虚焊 / 负载电容不对） | 换 LSI 先验证逻辑；查 `RCC_FLAG_LSERDY` |
| 每次上电都回到初始时间 | 没写 BKP 标记，或 VBAT 没电 | 写 `BKP_DR1` 标记；换纽扣电池 |
| 时间差 8 小时 | 时间戳是 UTC，显示没加 28800 | 显示时 `ts + 28800` |
| 设置时间无效 | 没调 `RTC_WaitForLastTask()` | 每次写 RTC 后同步等待 |
| 下载程序后时间丢了 | 下载器勾了「全片擦除」，把备份域也清了 | 改成「仅擦除用到的扇区」，或用串口下载 |

:::tip 上电第一件事：判断备份域是否有效
标准做法就是本课的 `BKP_DR1` 标记法。更严谨一点：再存一个「魔数 + 校验」的组合（比如 `0xA5` 存两处，两处都对才认），防止 RAM 随机值碰巧等于标记。
:::

## 练习
Q| 2026-11-16 12:00:00（北京时间）对应的时间戳大概是多少？为什么不用精确值也能判断对错？
A| 北京时间要先减 8 小时换成 UTC：2026-11-16 04:00:00 UTC。从 1970 到 2026 是 56 年，其中闰年 14 个（1972…2024），天数 = 56×365 + 14 = 20454 天，秒数 ≈ 20454 × 86400 ≈ 1,767,225,600，再加 4 小时 14400 ≈ 1,767,240,000。
A| 手算允许有几百秒误差（闰年数、跨年边界），量级对上就说明方法对了。要精确值就用代码算，或用 `date -d` 之类工具核对。
Q| 为什么 RTC 要配 32767 而不是 32768 作为预分频值？
A| 因为 RTC 的预分频寄存器 `PRL` 是「分频值 − 1」。写 32767 表示 ÷(32767+1) = ÷32768，得到 1Hz。
A| 写 32768 会变成 ÷32769，时钟慢约 30ppm，一天差约 2.6 秒。这类「差一点点」的错误很难在短时间内发现，但对时钟产品是致命的。
Q| 断电后时间归零，但换了新电池就好了。怎么判断到底是电池没电还是配置没保存？
A| 先量 VBAT 电压：正常纽扣电池应 ≥2.5V（CR1220 新电池约 3V），低于 2V 就会丢备份域。
A| 电池正常但仍归零，说明 BKP 标记没写成功：检查是否漏了 `PWR_BackupAccessCmd(ENABLE)`（不打开写权限，写 BKP 静默失败）。也可以读一次 `BKP_DR1` 确认标记是否真的存进去了。
Q| 用 RTC 秒中断每秒刷新 OLED，发现屏幕偶尔闪一下或显示错位。为什么不能直接在中断里刷屏？
A| 刷一整屏 OLED 要走 I2C 写 1024 字节，软件 I2C 下要几十毫秒。这远超 1 秒的中断间隔不说，期间所有其他中断都被阻塞，显示会撕裂。
A| 正确做法：中断里只置 `sec_flag = 1`，主循环检测到标志再刷新显示。这就是「中断搬数据、主循环做业务」的又一次应用。
