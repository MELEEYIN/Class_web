# -*- coding: utf-8 -*-
"""
build_en_stm32_hal.py — 生成 site/en/stm32-hal.html（STM32 HAL 库课程页）

正文是 24 课 + 附录的 Markdown（site/en/stm32-hal/lessons/*.md），
渲染器与外壳完全复用 build_en_stm32.py：同一套 md 契约、同一套 CSS、
同一个 en.js（进度 / 侧栏 / 页内目录 / 答案遮罩），只是 body 的 data-book
换成 stm32hal，进度不会和标准库那门课混在一起。

用法（仓库根目录）：
    python tools/build_en_stm32_hal.py
"""
import glob
import html
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_en_stm32 as base
from nav_shared import build_nav

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
LESSON_DIR = os.path.join(SITE, "en", "stm32-hal", "lessons")
OUT = os.path.join(SITE, "en", "stm32-hal.html")

inline = base.inline
parse_lesson = base.parse_lesson
render_lesson = base.render_lesson

# ---------------------------------------------------------------------------
# 首页区块：课程地图 / 器件清单
# ---------------------------------------------------------------------------
MAP_PARTS = [
    ("第一篇", "HAL 与工具", "s01", "库怎么分层、工程怎么建、时钟怎么算，先理顺"),
    ("第二篇", "GPIO 与中断", "s06", "点灯、按键、外部中断：把「配置 → 回调」走通"),
    ("第三篇", "串口通信", "s10", "最常用的调试口，也是第一个完整通信协议"),
    ("第四篇", "定时器与看门狗", "s12", "精确定时、PWM、捕获与高级定时器"),
    ("第五篇", "总线与数据通路", "s18", "I2C / SPI / DMA / ADC：数据怎么进出芯片"),
    ("第六篇", "系统与进阶", "s22", "时间、功耗、CAN 与提高篇路线"),
]


def render_map():
    out = ['<div class="stm-map">']
    for part, name, first, desc in MAP_PARTS:
        out.append('<a class="stm-mc" href="#%s"><span class="stm-mk">%s</span>'
                   '<b>%s</b><span class="stm-md">%s</span></a>'
                   % (first, part, name, desc))
    out.append("</div>")
    return "".join(out)


BILL = [
    ("STM32F103C8T6 最小系统板",
     "Cortex-M3 @72MHz，64KB Flash / 20KB SRAM；板载 8MHz 晶振、复位键、BOOT0 跳线", "1 块"),
    ("ST-Link V2（或 DAP-Link）",
     "SWD 四线：3.3V / GND / SWDIO / SWCLK；CubeMX 生成工程后直接下载调试", "1 个"),
    ("USB 转 TTL（CH340）",
     "USART1：PA9(TX) / PA10(RX)，交叉接、共地；也用于串口下载与 printf 输出", "1 个"),
    ("LED + 1kΩ 限流电阻",
     "接 PA8 或板载 LED；低电平点亮（灌电流），高电平熄灭，第 07 课点灯用", "1 套"),
    ("轻触按键",
     "接 PB1，一端 IO 一端 GND，IO 配内部上拉；用于 GPIO 输入与 EXTI", "2 个"),
    ("0.96 寸 OLED（SSD1306，I2C）",
     "四针：VCC / GND / SCL→PB6 / SDA→PB7；硬件 I2C1 或软件模拟都行", "1 块"),
    ("MPU6050 六轴模块",
     "I2C 地址 0x68（8 位写 0xD0）；INT→PB5，可做姿态与中断实验", "1 块"),
    ("W25Q64 Flash 模块",
     "SPI1：CS→PA4 / SCK→PA5 / MISO→PA6 / MOSI→PA7；2MB 串行 Flash", "1 块"),
    ("SG90 舵机 + TB6612 电机驱动",
     "舵机信号→PA1（TIM2_CH2，50Hz）；电机 PWM 与方向脚见第 14 课", "1 套"),
    ("有源蜂鸣器 / 红外对管 / 旋转编码器",
     "蜂鸣器→PB12；红外 DO→PB14；编码器 A/B→PB0 / PB1，按需选配", "各 1 个"),
]


def render_bill():
    rows = "".join('<tr><td class="p">%s</td><td>%s</td><td class="n">%s</td></tr>'
                   % (inline(a), inline(b), c) for a, b, c in BILL)
    return ('<div class="mod"><h3><span class="mtag">清单</span>这门课要用的器件</h3>'
            '<table><colgroup><col style="width:31%%"><col style="width:55%%"><col style="width:14%%">'
            '</colgroup><thead><tr><th>器件</th><th>关键参数 / 接线</th><th>数量</th></tr></thead>'
            "<tbody>%s</tbody></table></div>" % rows)


def render_appendix():
    path = os.path.join(LESSON_DIR, "99-apx.md")
    if not os.path.exists(path):
        return ""
    L = parse_lesson(path, lid="apx")
    return (
        '<section class="unit stm" id="apx" data-unit="apx" data-title="%s">'
        '<div class="uhead"><div class="uno">附</div>'
        '<div class="ut"><h2 class="u2t">%s<span class="uzh">附录</span></h2>'
        '<p class="usub">%s</p></div>'
        '<div class="ubadges"><span class="verdict off">速查</span>'
        '<button class="btn-done" type="button" data-unit="apx">标记已学</button></div></div>'
        '<p class="lead">%s</p>%s</section>'
        % (L["name"], inline(L["name"]), html.escape(L["meta"].get("video", "")),
           inline(L["meta"].get("lead", "")), L["body"])
    )


# ---------------------------------------------------------------------------
# 页面骨架：直接复用标准库页的外壳，只换文案与内容
# ---------------------------------------------------------------------------
HEAD = base.HEAD
HEAD = HEAD.replace(
    "<title>STM32 单片机 · 从点灯到总线 · 19 课</title>",
    "<title>STM32 HAL 库 · 从 CubeMX 到外设 · 24 课</title>")
HEAD = re.sub(
    r'<meta name="description" content="[^"]*">',
    '<meta name="description" content="STM32F103C8T6 的 HAL 库入门课：'
    'CubeMX 建工程、时钟树与 SysTick、GPIO/EXTI/NVIC、USART、IWDG/WWDG、'
    'TIM 定时与 PWM/输入捕获/高级定时器、I2C 与 OLED/MPU6050、SPI 与 W25Q64、'
    'DMA、ADC/DAC、RTC 与低功耗、CAN/RS485/单总线，24 课按六篇推进，'
    '每课给出原理、CubeMX 配置步骤、可编译的 HAL 代码与练习。">',
    HEAD, count=1)
HEAD = HEAD.replace(
    '<link rel="stylesheet" href="./stm32.css">',
    '<link rel="stylesheet" href="./stm32.css">\n'
    '<link rel="stylesheet" href="./stm32-hal.css">')
HEAD = HEAD.replace('<body data-book="stm32">', '<body data-book="stm32hal">')
HEAD = HEAD.replace('<span>STM32 进度</span>', '<span>HAL 进度</span>')
HEAD = HEAD.replace('<div class="pg-t"><span>HAL 进度</span><b id="pgNum">0 / 20</b></div>',
                    '<div class="pg-t"><span>HAL 进度</span><b id="pgNum">0 / 25</b></div>')
HEAD = HEAD.replace('<a class="mini-btn" href="./math.html">高等数学</a>',
                    '<a class="mini-btn" href="./stm32.html">标准库课程</a>')
HEAD = HEAD.replace('<span class="cur">STM32 单片机</span>',
                    '<span class="cur">STM32 HAL 库</span>')
HEAD = HEAD.replace('<a class="top-btn" href="./math.html"><span class="tl">高数</span></a>',
                    '<a class="top-btn" href="./stm32.html"><span class="tl">标准库</span></a>')
HEAD = HEAD.replace('placeholder="搜外设、库函数、报错…"',
                    'placeholder="搜 HAL 函数、CubeMX 配置、报错…"')

DOC_HEAD = """<header class="doc-head">
              <div class="eyebrow">课程学习站 · 单片机 · HAL 库</div>
              <h1>STM32 HAL<span class="hno">24 课</span></h1>
              <p class="lede">同一块 STM32F103C8T6，换一种开发方式：不再手写寄存器、也不再逐个外设搬标准库，而是用 <b>STM32CubeMX 点出引脚与参数</b>、由 CubeMX 生成 HAL 初始化代码，你只写业务逻辑。24 课按六篇推进，每课固定五件东西：<b>要解决什么问题</b>、<b>原理与框图</b>、<b>CubeMX 怎么配</b>、<b>HAL 代码怎么写</b>、<b>四道带解析的练习</b>。</p>
              <div class="chips">
                <span class="chipk"><b>6</b> 篇</span>
                <span class="chipk"><b>24</b> 课</span>
                <span class="chipk"><b>@@NSEC@@</b> 节</span>
                <span class="chipk"><b>@@NEX@@</b> 道练习</span>
                <span class="chipk lv">F103C8T6 · HAL 1.8</span>
                <span class="chipk">CubeMX 6.x</span>
                <span class="chipk">代码可编译</span>
              </div>
            </header>"""
HEAD = re.sub(r'<header class="doc-head">.*?</header>', DOC_HEAD, HEAD, count=1, flags=re.S)

INTRO = """<div class="callout ok">
                <p><b>这一页怎么用</b></p>
                <p>① 先装好 Keil MDK5 + STM32F1 器件包 + STM32CubeMX，再按课号做；每课都把工程烧进板子看到现象，单片机不看现象等于没学。② 每课的「CubeMX 怎么配」是这一课最短的路：照表点完，生成代码，再对照「HAL 代码」看 CubeMX 到底替你写了什么。③ 右上角「标记已学」只记在本机，侧栏进度条是给自己看的；HAL 进度与标准库那门课分开存，互不影响。</p>
                <p>课程来源是正点原子《手把手教你学 STM32 HAL 库开发全集》199 讲的目录与讲解顺序（P1–P199）。视频以 F103ZE / 战舰板为主，本站把示例统一到 <b>F103C8T6 最小系统板 + HAL 1.8.x + CubeMX 6.x</b>，引脚在每课开头给出对照；视频里讲过的外设一个不少，视频里跳过的基础（时钟树、启动过程、回调机制）这里按「原理 → 配置 → 代码 → 坑 → 练习」补齐。和 <a href="./stm32.html">标准库 19 课</a> 是同一条硬件路线的两种写法，学完一门再学另一门，会看得非常清楚。</p>
              </div>"""
HEAD = re.sub(r'<div class="callout ok">\s*<p><b>这一页怎么用</b></p>.*?</div>',
              INTRO, HEAD, count=1, flags=re.S)

OLD_SOFT = re.search(r'<div class="callout">\s*<p><b>软件三件套</b>.*?</div>', HEAD, re.S)
SOFT = """<div class="callout">
                <p><b>软件四件套</b>：Keil MDK5（≥5.36）+ <b>Keil.STM32F1xx_DFP</b> 器件包 + <b>STM32CubeMX 6.x</b>（登录 ST 账号下载 STM32CubeF1 固件包，含 HAL 1.8.x）+ 串口助手。下载调试用 ST-Link / DAP-Link 驱动；CubeMX 的 Project Manager 里 Toolchain 选 <b>MDK-ARM</b>，勾 <b>Copy only the necessary library files</b>，生成的工程可以直接编译。</p>
                <p><b>版本别混</b>：HAL 库每个系列一个固件包（F1 是 STM32CubeF1），不同版本的 HAL API 基本不变，但 <code>HAL_</code> 结构体成员会增删。本页以 <b>STM32CubeF1 V1.8.x</b> 为准；CubeMX 升级后若某成员报「no member」，先查固件包版本，不要急着改代码。</p>
              </div>"""
if OLD_SOFT:
    HEAD = HEAD[:OLD_SOFT.start()] + SOFT + HEAD[OLD_SOFT.end():]

FOOT = """<div class="home-foot">
                <span>© 2026 校园主页 · 课程学习站 · 纯静态页面，进度只存本机</span>
                <span>STM32F103C8T6 · HAL 1.8.x · 24 课对应正点原子 HAL 库教程 P1–P199</span>
                <span>HAL 函数签名按 STM32CubeF1 固件包与 UM1850 核对；CubeMX 选项以 6.x 界面为准，板级接线以套件丝印为准。</span>
              </div>"""
OLD_FOOT = re.search(r'<div class="home-foot">.*?</div>', HEAD, re.S)
if OLD_FOOT:
    HEAD = HEAD[:OLD_FOOT.start()] + FOOT + HEAD[OLD_FOOT.end():]


def main():
    files = sorted(glob.glob(os.path.join(LESSON_DIR, "[0-9][0-9]-*.md")))
    files = [f for f in files if not os.path.basename(f).startswith("99-")]
    lessons = [parse_lesson(f) for f in files]
    body = "".join(render_lesson(L) for L in lessons)
    nsec = sum(L["nsec"] for L in lessons)
    nex = sum(L["nex"] for L in lessons)

    page = HEAD.replace("@@NAV@@", build_nav("./b1.html", "stm32hal"))
    page = page.replace("@@MAP@@", render_map())
    page = page.replace("@@BILL@@", render_bill())
    page = page.replace("@@LESSONS@@", body)
    page = page.replace("@@APX@@", render_appendix())
    page = page.replace("@@NSEC@@", str(nsec))
    page = page.replace("@@NEX@@", str(nex))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("written: %s  %d 课 / %d 节 / %d 题 / %d chars"
          % (OUT, len(lessons), nsec, nex, len(page)))


if __name__ == "__main__":
    main()