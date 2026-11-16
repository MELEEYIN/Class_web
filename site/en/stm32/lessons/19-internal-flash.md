# 19 · 内部 FLASH 与芯片 ID：把参数存进芯片里
part: 第六篇 · 系统与可靠性
video: P48 – P49 · FLASH 闪存 / 读写内部 FLASH、读取芯片 ID
level: 进阶
lead: 内部 Flash 是一块「掉电不丢、可以按页擦、按半字写」的存储器。它让单片机有了「记忆」：校准值、开机次数、设备编号，都可以写进去，下次上电还在。代价是操作有严格顺序，顺序错了就写不进去——而且不会报错。
goals:
- 能说清 F103C8 的 Flash 组织方式：多少页、每页多大、地址范围
- 能按「解锁 → 擦除 → 写半字 → 上锁」四步完成一次写入
- 能读出芯片的 96 位唯一 ID 和 Flash 容量，用来做设备标识
- 知道为什么不能擦第 0 页、为什么只能写半字
stats: 6 个小节 · 4 张表 · 4 道练习

## 一、Flash 的组织：64KB，64 页，每页 1KB

| 项目 | F103C8T6 的数值 | 说明 |
| --- | --- | --- |
| 主存储区 | 64KB | 0x0800_0000 – 0x0800_FFFF |
| 页大小 | 1KB（1024 字节） | **擦除的最小单位** |
| 页数 | 64 页 | 页 0 放程序，页 63 是最后一页 |
| 写入单位 | 16 位（半字） | 必须是偶地址，写 32 位要拆两次 |
| 擦除后状态 | 全 0xFF | 擦完再写才有意义 |
| 擦写寿命 | 约 1 万次 | 别在循环里反复擦同一页 |
| 信息块 | 系统存储器 + 选项字节 | 存 Bootloader 与读写保护配置 |

「页 0 不能擦」是硬规矩：中断向量表和启动代码就在里面，擦了芯片就再也启动不了——只能靠 SWD 重新烧程序救回来。**存参数一律用最后的几页**（比如页 62、页 63，地址 0x0800_F800 起）。

:::tip 怎么算地址
`地址 = 0x08000000 + 页号 × 1024`。
页 62 → 0x08000000 + 62 × 1024 = 0x0800F800；页 63 → 0x0800FC00。
反推：`页号 = (地址 - 0x08000000) / 1024`。
:::

## 二、四步写入法

Flash 有写保护，必须先「解锁」才能擦写。标准库把两次写入密钥的动作封装成了 `FLASH_Unlock()`：

```c
#include "stm32f10x.h"

/* 擦除一页（1KB） */
void MyFLASH_ErasePage(uint32_t addr)
{
    FLASH_Unlock();                         // ① 解锁
    FLASH_ClearFlag(FLASH_FLAG_EOP | FLASH_FLAG_PGERR | FLASH_FLAG_WRPRTERR);
    FLASH_ErasePage(addr);                  // ② 擦除（整页变 0xFF）
    FLASH_Lock();                           // ③ 上锁
}

/* 写一个半字（16 位）；addr 必须是偶数 */
void MyFLASH_WriteHalfWord(uint32_t addr, uint16_t data)
{
    FLASH_Unlock();
    FLASH_ProgramHalfWord(addr, data);
    FLASH_Lock();
}

/* 读：直接当指针访问，不需要解锁 */
uint16_t MyFLASH_ReadHalfWord(uint32_t addr)
{
    return *(volatile uint16_t *)addr;
}

/* 读 32 位 / 字节同理 */
uint32_t MyFLASH_ReadWord(uint32_t addr)
{
    return *(volatile uint32_t *)addr;
}
```

读操作不需要解锁、不需要库函数——Flash 在地址空间里就是普通内存，指针直接读。这一点和第 12 课的 DMA 一样：**地址即数据**。

## 三、写一个结构体：先凑成半字再写

实际项目里要存的通常是一组参数，不是一个半字。做法是把它当字节数组，两个字节拼成一个半字写入：

```c
typedef struct {
    uint16_t magic;        // 0x5AA5 表示「已初始化」
    uint16_t boot_count;   // 开机次数
    int16_t  offset;       // 校准偏移
    uint16_t crc;          // 简单校验
} Param_t;

#define PARAM_ADDR  0x0800F800     // 页 62
#define PARAM_MAGIC 0x5AA5

void Param_Save(Param_t *p)
{
    uint8_t *raw = (uint8_t *)p;
    uint16_t i, sum = 0;

    p->magic = PARAM_MAGIC;
    p->crc   = 0;
    for(i = 0; i < sizeof(Param_t); i++) sum += raw[i];   // 先把 crc 当 0 累加
    p->crc = sum;                                          // 再把结果写进 crc 字段

    MyFLASH_ErasePage(PARAM_ADDR);
    for(i = 0; i < sizeof(Param_t); i += 2){
        uint16_t hw = raw[i] | (raw[i + 1] << 8);          // 小端拼半字
        MyFLASH_WriteHalfWord(PARAM_ADDR + i, hw);
    }
}

uint8_t Param_Load(Param_t *p)
{
    uint8_t *raw = (uint8_t *)p;
    uint16_t i, sum = 0, crc;

    for(i = 0; i < sizeof(Param_t); i += 2){
        uint16_t hw = MyFLASH_ReadHalfWord(PARAM_ADDR + i);
        raw[i]     = hw & 0xFF;
        raw[i + 1] = hw >> 8;
    }
    if(p->magic != PARAM_MAGIC) return 0;                    // 从没写过

    crc = p->crc;
    for(i = 0; i < sizeof(Param_t); i++) sum += raw[i];
    return ((uint16_t)(sum - crc) == crc);                   // 去掉 crc 自身后应等于它
}
```

`sizeof(Param_t)` 是偶数（4 个 `uint16_t` 成员），所以按半字循环正好对齐。如果结构体里有 `uint8_t` 成员，总长度可能是奇数，最后一次写入要补一个 0xFF——**半字对齐是 Flash 写入最硬的要求**。

## 四、芯片 ID：出厂刻好的身份证

每颗 STM32 在出厂时都烧了一个 96 位（12 字节）的唯一 ID，读出来可以当设备序列号：

| 信息 | 地址 | 长度 | 示例值 |
| --- | --- | --- | --- |
| 唯一 ID（UID） | 0x1FFFF7E8 | 96 位 = 12 字节 | 三个 32 位字，每颗芯片都不同 |
| Flash 容量 | 0x1FFFF7E0 | 16 位 | 0x0040 = 64（单位 KB） |
| 器件 ID | 0xE0042000（DBGMCU_IDCODE） | 32 位 | 低 12 位是器件号，高 16 位是版本 |

```c
void Read_ChipID(void)
{
    uint32_t uid0 = *(volatile uint32_t *)0x1FFFF7E8;
    uint32_t uid1 = *(volatile uint32_t *)0x1FFFF7EC;
    uint32_t uid2 = *(volatile uint32_t *)0x1FFFF7F0;
    uint16_t flash_kb = *(volatile uint16_t *)0x1FFFF7E0;

    printf("UID: %08X-%08X-%08X\r\n", uid0, uid1, uid2);
    printf("Flash: %u KB\r\n", flash_kb);
}
```

UID 的用途：设备授权（只认自己的芯片）、加密算法的种子、日志里的设备标识。**注意它不是密钥**——任何人都能读出来，别拿它当密码。

## 五、坑：写不进、读回 0xFF、程序跑不起来

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 写进去读回还是旧值 | 没擦除（0 位无法变 1） | 写前必须 `FLASH_ErasePage` |
| 读回全是 0xFF | 擦除成功但没写进去：忘了 `FLASH_Unlock` | 解锁 → 写 → 上锁，顺序别省 |
| 写入后数据错位 | 地址是奇数，或结构体长度是奇数没补齐 | 一律偶地址、按半字对齐 |
| 擦完程序就不启动了 | 擦了页 0（0x08000000 起） | 只用最后几页存参数 |
| 反复擦写后写入失败 | 超过 1 万次寿命 | 换页轮换写（磨损均衡） |
| 擦除时程序卡住几十毫秒 | Flash 擦除期间 CPU 取指被挂起 | 属正常现象；避免在中断里擦写 |

:::warn 擦写期间 CPU 会停
Flash 擦除一页需要 20–40ms，这段时间内 CPU 从 Flash 取指令会被硬件挂起（总线等待）。表现是「按一下保存，程序像卡了一下」。
如果这时有串口数据在收，会丢字节；如果有看门狗（第 18 课），可能被咬。所以**擦写要放在主循环里做，且中间不要指望中断能及时响应**。
:::

## 六、这一课之后的完整闭环

到第 19 课，你已经能把前面所有东西串成一个真实设备：

| 模块 | 用到的课 | 在设备里的角色 |
| --- | --- | --- |
| 参数存储 | 19（Flash）+ 16（BKP） | 校准值、设备编号、开机次数 |
| 时间 | 16（RTC） | 数据打时间戳 |
| 采集 | 11（ADC）+ 12（DMA） | 周期性采样，不占 CPU |
| 人机界面 | 05（OLED）+ 04（按键） | 显示与设置 |
| 通信 | 13（USART）/ 14（I2C）/ 15（SPI） | 上报数据、接传感器、存日志 |
| 可靠性 | 18（看门狗）+ 17（低功耗） | 死机自恢复、电池供电 |

这个组合就是市面上大多数「小型数据采集器」的骨架。剩下的工作是业务逻辑，不再是单片机知识。

## 练习
Q| F103C8 的页大小是 1KB，要存 100 字节的参数，会浪费多少空间？为什么不能只擦 100 字节？
A| 擦除单位是整页 1KB，所以会浪费约 924 字节。
A| 因为 Flash 的擦除是「按页施加高压、整页置 1」的物理过程，硬件不支持按字节擦除。这也是为什么小数据量参数适合存在 BKP（20 字节）或外部 EEPROM 里，而不是内部 Flash。
Q| 想把参数存在 0x0800F800，这是第几页？如果误擦了 0x08000000 会怎样？
A| (0x0800F800 − 0x08000000) / 1024 = 62，所以是第 62 页（倒数第二页）。
A| 0x08000000 是第 0 页，里面是中断向量表和启动代码。擦掉后芯片上电找不到复位向量，直接不启动；SWD 通常还能连上（SWD 不依赖 Flash 内容），可以重新烧程序救回来——但如果没有调试器，芯片就「砖」了。
Q| 写入一个 5 字节的结构体，按半字写会出什么问题？怎么处理？
A| 5 字节不是偶数，最后一次只凑得出 1 个字节，无法组成一个完整半字。若强行写 2 个字节，会多写一个字节到不该写的地址。
A| 处理办法：把结构体补齐到偶数长度（加一个 padding 字节），或把最后 1 字节与 0xFF 拼成半字写入，读回时忽略那个 0xFF。`__attribute__((packed))` 能让结构体紧凑，但会破坏对齐，反而更容易出错——宁可浪费 1 字节。
Q| 为什么读 Flash 不需要 `FLASH_Unlock()`，写却需要？
A| 读只是总线访问，和读 SRAM 一样，没有任何副作用。写/擦会改变存储内容，为了防止程序跑飞时误改代码区，硬件加了「密钥序列」保护：连续写入 0x45670123 和 0xCDEF89AB（`FLASH_Unlock` 内部完成）才打开写权限。
A| 上锁之后 `FPEC` 寄存器只读，任何写操作都被忽略。这也是为什么忘了 Unlock 时「程序不报错、就是写不进去」——硬件直接丢弃了操作。
