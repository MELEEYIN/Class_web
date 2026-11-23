# 24 · 提高篇：文件系统、图片音频、USB 与 IAP

part: 第六篇 · 系统与进阶
video: P176 – P199
level: 进阶
lead: 前面 23 课解决「单个外设怎么用」，提高篇解决「一个完整产品怎么组织」：内存怎么管、文件怎么存、图片音频怎么播、USB 怎么枚举、程序怎么在线升级。这些内容每一个都能单独开一门课，这一课给出路线图与最小可跑方案，避免在庞杂的中间件里迷路。

goals:
- 能说出内存池/碎片的基本问题，知道什么时候不该用 `malloc`
- 能用 SD 卡 + FATFS 读写一个文件，理解挂载/打开/读写/关闭流程
- 知道图片解码、汉字显示、音频播放的基本链路与资源开销
- 能说清 USB CDC/HID/MSC 的差异，以及 IAP 的分区与跳转原理

stats: 4 个方向 · 1 套分区 · 1 条产品化路线

## 一、内存管理：先把「谁在用 RAM」说清

F103C8 只有 20KB RAM，提高篇的第一个门槛不是代码，而是内存：

| 区域 | 用途 | 注意 |
|---|---|---|
| `.data` | 有初值全局变量 | 初值占 Flash，运行时占 RAM |
| `.bss` | 零初始化全局变量 | 大数组最容易撑爆 |
| 栈 | 局部变量、函数调用 | 从 RAM 顶端向下，溢出会改写全局变量 |
| 堆 | `malloc` 动态分配 | 碎片化，嵌入式一般不用 |

### 三条实践

1. **能静态就静态**：缓冲区用全局数组/静态数组，大小在编译期确定；
2. **用内存池代替 malloc**：固定块大小、分配/释放 O(1)，不会碎片；
3. **算最坏情况**：DMA 缓冲 + 协议栈 + 栈，按峰值留 30% 余量。

```c
/* 极简固定块内存池 */
#define POOL_BLK   32
#define POOL_N     8
static uint8_t pool[POOL_N][POOL_BLK];
static uint8_t used[POOL_N];

void *pool_alloc(void)
{
    for (int i = 0; i < POOL_N; i++) {
        if (!used[i]) { used[i] = 1; return pool[i]; }
    }
    return NULL;
}
void pool_free(void *p)
{
    for (int i = 0; i < POOL_N; i++)
        if (p == pool[i]) { used[i] = 0; return; }
}
```

## 二、SD 卡与 FATFS

### 硬件

- **SDIO**：4 位并行，速度快，F103 大容量型号才有；
- **SPI**：4 线，速度慢但任何 SPI 口都能接，C8T6 常用。

### CubeMX

1. 配 SPI1（或 SDIO）；
2. **Middleware → FATFS**：选 SD Card，配置卷名、编码；
3. 生成后 `fatfs.c` 里 `MX_FATFS_Init()`，`ff.c` 提供 `f_mount/f_open/f_read/f_write`。

### 最小读写

```c
FATFS fs;
FIL   file;
UINT  bw;
FRESULT fr;

fr = f_mount(&fs, "", 1);                 /* 挂载 */
if (fr == FR_OK) {
    fr = f_open(&file, "log.txt", FA_OPEN_ALWAYS | FA_WRITE | FA_READ);
    if (fr == FR_OK) {
        f_write(&file, "hello\r\n", 7, &bw);
        f_lseek(&file, 0);
        char buf[32] = {0};
        UINT br;
        f_read(&file, buf, sizeof(buf) - 1, &br);
        f_close(&file);
    }
}
```

要点：

- `f_mount` 之后才能操作文件；
- 写完必须 `f_close`（或 `f_sync`），否则 FAT 表没更新，拔卡丢数据；
- 长文件名要开 `_USE_LFN`，占更多 RAM/Flash；
- 不要在中断里做文件操作，SPI 传输可能几十毫秒。

## 三、图片、汉字与音频

| 方向 | 链路 | 开销 |
|---|---|---|
| 汉字显示 | 字库（GB2312/Unicode）→ 取模 → LCD/OLED 显存 | 字库几 MB，放外部 Flash |
| 图片显示 | BMP 直接读；JPEG 需解码（TjpgDec 等） | 解码缓冲要几 KB–几十 KB |
| 音频播放 | VS1053（SPI，自带解码）或 ES8388 + I2S | 高码率要外部 Codec |
| 视频 | 逐帧 JPEG + LCD 刷新 | 对 F1 来说很吃力 |

对 C8T6 的现实建议：OLED 显示汉字用 12/16 点阵、只取用到的字；图片用 BMP/单色位图；音频用 VS1053 模块（SPI），不要试图软件解 MP3。

## 四、USB：CDC / HID / MSC

F103 有 USB 2.0 全速设备控制器，CubeMX 的 **Middleware → USB_DEVICE** 可选：

| 类 | 用途 | 主机看到什么 | 复杂度 |
|---|---|---|---|
| CDC | 虚拟串口 | COM 口 | 低，最常用 |
| HID | 键鼠/自定义 | 无需驱动 | 中，报告描述符 |
| MSC | U 盘 | 盘符 | 中，配合 FATFS |
| DFU | 固件升级 | 升级工具 | 中，配合 IAP |

CDC 最小用法：CubeMX 选 `Communication Device Class (Virtual Port Com)`，生成后 `MX_USB_DEVICE_Init()`，用 `CDC_Transmit_FS()` 发送、重写 `CDC_Receive_FS()` 接收。注意 USB 时钟必须精确 48MHz，F1 的 USB 预分频要配对。

## 五、IAP：不用调试器升级程序

IAP（In-Application Programming）把 Flash 分成两段：

```
0x08000000 ┌──────────────┐
           │ Bootloader   │  负责接收新固件、擦写 APP 区、跳转
0x08004000 ├──────────────┤
           │ APP          │  用户程序（向量表偏移 0x4000）
0x08010000 └──────────────┘
```

### Bootloader 跳转

```c
typedef void (*pFunction)(void);
pFunction jump;

/* 1. 检查 APP 区是否有有效栈顶 */
uint32_t sp = *(volatile uint32_t *)APP_ADDR;
if ((sp & 0xFFFE0000) != 0x20000000) return;

/* 2. 关中断、复位外设 */
__disable_irq();
HAL_RCC_DeInit();
HAL_DeInit();

/* 3. 设 MSP、设向量表、跳转 */
SCB->VTOR = APP_ADDR;
__set_MSP(sp);
jump = (pFunction)(*(volatile uint32_t *)(APP_ADDR + 4));
jump();
```

### APP 端

- 链接地址改成 `0x08004000`；
- `SCB->VTOR = 0x08004000`（HAL 可在 `SystemInit` 后设）；
- 中断向量表随 APP 偏移，否则中断会跳到 Bootloader 的表。

## 六、提高篇之后往哪走

| 方向 | 要补的 | 建议起点 |
|---|---|---|
| RTOS | 任务、队列、信号量、优先级 | CubeMX 加 FreeRTOS，把第 13 课的定时任务拆成多任务 |
| 通信协议 | Modbus、CANopen、MQTT | 用第 11 课的串口帧扩展成 Modbus |
| 电机控制 | PID、FOC、编码器 | 第 14 + 15 + 16 课组合 |
| 产品化 | 低功耗、看门狗、IAP、EMC | 第 12 + 22 + 本周 IAP |
| 图形界面 | LVGL、TouchGFX | 换 F4/F7 + LCD，HAL 生态直接支持 |

## 七、坑：提高篇的典型翻车

| 现象 | 原因 | 修法 |
|---|---|---|
| FATFS 挂载失败 | SD 卡没格式化 / SPI 模式错 | 格式化为 FAT32，确认模式 0 |
| 写文件后拔卡丢数据 | 没 `f_close/f_sync` | 写完关闭，或定期 sync |
| USB 不枚举 | 48MHz 时钟不对 / D+ 上拉 | 查 USB 预分频与硬件 |
| IAP 跳转后死机 | APP 向量表没偏移 / 没关中断 | 设 VTOR、关中断、DeInit |
| 图片花屏 | 取模方向/字节序错 | 对照屏幕扫描方向与取模设置 |
| 音频卡顿 | SPI 速度不够 / 缓冲太小 | 提高 SPI 时钟，加双缓冲 |
| 内存越用越少 | malloc 碎片 | 用固定块内存池 |

## 练习

Q| 为什么嵌入式产品通常不建议用 `malloc/free`？内存池如何避免碎片？
A| `malloc` 会在堆上按需切分，反复申请不同大小后留下许多不连续的小空洞，总空闲够但最大连续块不够，最终分配失败（碎片）。内存池预先切好固定大小块，分配/释放只是改标志位，O(1) 且不会产生大小不一空洞；代价是块大小固定、可能浪费一些空间。实时系统还要求分配时间可预测，malloc 不满足。

Q| FATFS 写文件后，为什么必须 `f_close()` 或 `f_sync()`？只 `f_write()` 就拔卡会发生什么？
A| `f_write` 只把数据写入缓冲区/簇，FAT 表与目录项可能还没更新；`f_close/f_sync` 才会把缓存刷到卡上并更新 FAT。直接拔卡会导致文件长度、簇链不完整，轻则文件内容截断，重则整个分区损坏。产品里还要考虑掉电：定期 sync，或用日志式文件系统。

Q| USB CDC 与 UART 串口有什么本质区别？为什么 CDC 的波特率设置其实不影响速度？
A| UART 是真正的异步串行，波特率决定位速率；USB CDC 是 USB 设备类，主机把它枚举成虚拟 COM 口，数据走 USB 批量端点，实际速度由 USB 全速 12Mbps 与主机轮询决定。CDC 的「波特率」只是线路编码参数，传给主机做兼容显示，不影响 USB 传输速率。

Q| IAP 中 Bootloader 跳转到 APP 前，为什么要设 MSP、设 VTOR、关中断？少做一步会怎样？
A| 设 MSP：APP 有自己的栈顶，必须让内核用 APP 的栈；设 VTOR：APP 的中断向量表在 0x08004000，不设则中断仍跳 Bootloader 的表，可能进错误处理；关中断：跳转前停止 Bootloader 的中断，避免跳转瞬间有中断进来。少设 VTOR 的典型现象是「APP 主循环能跑，但一进中断就死」；不设 MSP 可能栈越界。