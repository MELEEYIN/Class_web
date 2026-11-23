# 07 · HAL GPIO 配置与点灯实战

part: 第二篇 · GPIO 与中断
video: P49 – P52
level: 基础
lead: 上一课讲「引脚里有什么」，这一课讲「HAL 怎么把它配出来」。GPIO 是 HAL 里最简单的外设，但它的配置步骤是后面所有外设的模板：使能时钟 → 填结构体 → 初始化 → 读写。把点灯和按键做扎实，USART、TIM、SPI 都只是换函数名。

goals:
- 能按「时钟 → 参数 → 初始化 → 读写」四步独立配置一个 GPIO
- 能默写 `HAL_GPIO_Init/WritePin/ReadPin/TogglePin` 的用法与参数
- 能用 CubeMX 配出 LED 与按键，写出「按键控制 LED」的完整程序
- 能处理按键抖动，知道软件消抖与硬件消抖的取舍

stats: 1 个使能宏 · 4 个函数 · 2 个实战

## 一、GPIO 配置四步法

HAL 把「配一个外设」抽象成固定四步，GPIO 是最直观的例子：

### 第 1 步：使能时钟

F1 的 GPIO 挂在 **APB2** 上：

```c
__HAL_RCC_GPIOA_CLK_ENABLE();   /* 等价于 RCC->APB2ENR |= RCC_APB2ENR_IOPAEN */
__HAL_RCC_GPIOB_CLK_ENABLE();
```

不使能时钟，后面写寄存器全部无效，引脚没有任何反应——这是新手第一大坑。

### 第 2 步：填初始化结构体

```c
GPIO_InitTypeDef GPIO_InitStruct = {0};

GPIO_InitStruct.Pin   = GPIO_PIN_8;           /* 哪个/哪些引脚，可或运算 */
GPIO_InitStruct.Mode  = GPIO_MODE_OUTPUT_PP;  /* 输出推挽 */
GPIO_InitStruct.Pull  = GPIO_NOPULL;          /* 不用上下拉 */
GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;  /* 低速，够 LED 用 */
```

`GPIO_InitTypeDef` 只有四个成员，对应 CRL/CRH 里的 MODE/CNF 位和上下拉位。

### 第 3 步：调用 `HAL_GPIO_Init()`

```c
HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
```

第二个参数是端口基址（`GPIOA`…`GPIOG`），第一个参数里的 `Pin` 是 16 位掩码。一次可以初始化同一端口的多个脚：

```c
GPIO_InitStruct.Pin = GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_2;
```

### 第 4 步：读写

```c
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET);  /* 输出低 */
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_SET);    /* 输出高 */
GPIO_PinState s = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_1); /* 读输入 */
HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_8);                 /* 翻转 */
```

## 二、CubeMX 怎么配

### LED（PA8，推挽输出，低电平点亮）

1. 在芯片图上点 **PA8** → `GPIO_Output`；
2. 左侧 **System Core → GPIO → PA8**：
   - GPIO output level：`High`（初始灭）
   - GPIO mode：`Output Push Pull`
   - GPIO Pull-up/Pull-down：`No pull-up and no pull-down`
   - Maximum output speed：`Low`
   - User Label：`LED`
3. 生成代码后，`gpio.c` 里出现：

```c
void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOA_CLK_ENABLE();          /* 时钟 */

  HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_SET);  /* 默认电平 */

  GPIO_InitStruct.Pin   = LED_Pin;
  GPIO_InitStruct.Mode  = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull  = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(LED_GPIO_Port, &GPIO_InitStruct);
}
```

### 按键（PB1，输入上拉）

1. 点 **PB1** → `GPIO_Input`；
2. GPIO 设置：`Pull-up`，User Label `KEY`；
3. 生成后是 `GPIO_MODE_INPUT` + `GPIO_PULLUP`。

## 三、实战 1：LED 闪烁

```c
/* main.c — USER CODE BEGIN 2 / 3 */
uint32_t last = 0;

while (1)
{
  if (HAL_GetTick() - last >= 500) {
    last = HAL_GetTick();
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
  }
}
```

用 `HAL_GetTick()` 而不是 `HAL_Delay(500)`：主循环还能同时干别的，后面加按键、串口都不会被延时卡住。

## 四、实战 2：按键控制 LED

### 简单版：按住亮，松开灭

```c
while (1)
{
  if (HAL_GPIO_ReadPin(KEY_GPIO_Port, KEY_Pin) == GPIO_PIN_RESET) {
    HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_RESET);  /* 按下点亮 */
  } else {
    HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_SET);
  }
}
```

### 进阶版：按一下翻转，带消抖

机械按键按下/松开时会有 5–20ms 的抖动，直接读会一次按下被识别成好几次。软件消抖的通用写法是「采样 + 计时」：

```c
#define KEY_DEBOUNCE_MS 20

static uint8_t  key_stable = 1;      /* 稳定状态：1=松开 */
static uint32_t key_tick   = 0;

void Key_Scan(void)
{
    uint8_t raw = (HAL_GPIO_ReadPin(KEY_GPIO_Port, KEY_Pin) == GPIO_PIN_RESET) ? 0 : 1;

    if (raw != key_stable) {
        if (key_tick == 0) {
            key_tick = HAL_GetTick();          /* 开始计时 */
        } else if (HAL_GetTick() - key_tick >= KEY_DEBOUNCE_MS) {
            key_stable = raw;                  /* 稳定超过 20ms，认账 */
            key_tick = 0;
            if (key_stable == 0) {             /* 下降沿：按下 */
                HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
            }
        }
    } else {
        key_tick = 0;                          /* 回到稳定态，清计时 */
    }
}
```

放到 `while(1)` 里每 1–5ms 调一次即可。硬件消抖（RC + 施密特）能省软件，但成本更高；一般产品用软件消抖就够。

## 五、HAL GPIO 函数速查

| 函数 | 作用 | 注意 |
|---|---|---|
| `HAL_GPIO_Init(port, &init)` | 初始化引脚 | 先开时钟 |
| `HAL_GPIO_DeInit(port, pin)` | 恢复默认 | 低功耗前用 |
| `HAL_GPIO_WritePin(port, pin, state)` | 写电平 | 内部走 BSRR/BRR |
| `HAL_GPIO_TogglePin(port, pin)` | 翻转 | 读改写，非原子 |
| `HAL_GPIO_ReadPin(port, pin)` | 读电平 | 返回 `GPIO_PIN_SET/RESET` |
| `HAL_GPIO_LockPin(port, pin)` | 锁定配置 | 防误改，少用 |
| `__HAL_RCC_GPIOx_CLK_ENABLE()` | 开时钟 | 宏，x = A…G |

## 六、坑：点灯点不亮

| 现象 | 原因 | 修法 |
|---|---|---|
| 完全没反应 | 没开 GPIO 时钟 | 加 `__HAL_RCC_GPIOx_CLK_ENABLE()` |
| 灯一直亮/灭 | 输出电平与 LED 接法相反 | 确认低电平点亮还是高电平点亮 |
| 按键读数不变 | 引脚配错 / 按键没共地 | 万用表量按下前后电平 |
| 一次按下触发多次 | 没消抖 | 加 20ms 消抖或硬件 RC |
| 编译报 `LED_Pin` 未定义 | User Label 没生成 / 头文件没包含 | 包含 `main.h`，重新生成 |
| 换引脚后不工作 | CubeMX 里没改，只改了代码 | 改 `.ioc` 并重新生成 |

## 练习

Q| 为什么 `HAL_GPIO_Init()` 之前必须先调用 `__HAL_RCC_GPIOx_CLK_ENABLE()`？只写寄存器不使能时钟会怎样？
A| F1 的外设时钟默认关闭以省电，GPIO 挂在 APB2 上，`RCC_APB2ENR` 对应位为 0 时 GPIO 模块没有时钟，寄存器写入被忽略（读回也可能是 0），引脚保持复位后的默认状态。表现为「代码没错、就是不动」。HAL 不会替你开时钟，因为时钟管理属于 MSP 层，必须显式使能。

Q| `GPIO_InitStruct.Pin` 能不能一次写多个引脚？这些引脚必须满足什么条件？
A| 能，`Pin` 是 16 位掩码，如 `GPIO_PIN_0 | GPIO_PIN_1`。它们必须属于**同一个 GPIO 端口**（同一个 `GPIOx`），因为 `HAL_GPIO_Init(GPIOx, ...)` 一次只操作一个端口；不同端口的引脚要分别初始化。同一个结构体里的 Mode/Pull/Speed 会应用到所有选中的引脚。

Q| 按键接 GND、IO 配输入上拉时，为什么「按下为 0」？如果程序里写成 `if (ReadPin(...) == GPIO_PIN_SET)` 判断按下，会有什么现象？
A| 上拉使松开时 IO 通过内部电阻接到 3.3V，读到 1；按下时 IO 直接接地，读到 0。若用 `== GPIO_PIN_SET` 判断按下，逻辑就反了：松开时被当成按下，按下时被当成松开。现象是「不按就动作、按住反而不动」。读按键一定要结合硬件接法确认有效电平。

Q| 软件消抖为什么通常取 20ms 左右？取 1ms 或 200ms 分别有什么问题？
A| 机械按键的抖动一般持续 5–20ms，20ms 能覆盖大多数按键。取 1ms 太短，抖动还没结束就被当成多次按下；取 200ms 虽不误触，但按键响应明显迟钝，快速连按会丢键。具体值要看按键手册和手感，20–30ms 是常用折中；也可以用「两次采样间隔 10ms、连续两次相同才认」的写法。