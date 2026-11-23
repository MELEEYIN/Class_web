# -*- coding: utf-8 -*-
"""修复入口补丁：修掉 heredoc 编码损坏的侧栏项，并插入首页 HAL 卡片。"""
import io
import re

HAL_NAV = ('<div class="nv-grp">相关课程</div>'
           '<a class="nv-i" href="./stm32-hal.html"><span class="no">HAL</span>'
           '<span class="tt">HAL 库课程 · 24 课</span><span class="mk"></span></a>')

HAL_CARD = """              <a class="path" href="./stm32-hal.html">
                <span class="pk">STM32 HAL 库 · 24 课</span>
                <b>CubeMX · 从图形化配置到外设</b>
                <p>同一块 F103C8T6 的第二种写法：CubeMX 点引脚 / 时钟 / 外设 → 生成 HAL 工程 → 只在 USER CODE 区写业务。24 课六篇：HAL 框架与 CubeMX → GPIO / EXTI / NVIC → USART → 看门狗 / 定时器 / PWM / 捕获 / 高级定时器 → I2C / SPI / DMA / ADC → RTC / 低功耗 / CAN / 提高篇。每课给 CubeMX 配置表、可编译的 HAL 代码、坑与四道练习，附录附 199 讲视频对照与 HAL API 速查。</p>
                <span class="go">打开 HAL 课程 →</span>
              </a>

"""


def fix_nav(s):
    """删除 stm32-nav 尾部已有的 HAL 项（正常或损坏），再插一条正确的。"""
    pat = re.compile(
        r'(?:<div class="nv-grp">(?:相关课程|\?{1,8})</div>\s*)?'
        r'<a class="nv-i" href="\./stm32-hal\.html">.*?</a>\s*(?=<!--/stm32-nav-->)',
        re.S)
    s = pat.sub('', s)
    return s.replace('<!--/stm32-nav-->', HAL_NAV + '<!--/stm32-nav-->', 1)


def patch(p, add_card=False):
    s = io.open(p, encoding='utf-8', newline='').read()
    n0 = len(s)
    s = fix_nav(s)
    if add_card and 'class="path" href="./stm32-hal.html"' not in s:
        anchor = '              <a class="path" href="./draw.html">'
        if anchor in s:
            s = s.replace(anchor, HAL_CARD + anchor, 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print(p, n0, '->', len(s),
          'nav_ok=', 'HAL 库课程 · 24 课' in s,
          'card=', 'class="path" href="./stm32-hal.html"' in s)


if __name__ == '__main__':
    patch('site/en/index.html', add_card=True)
    patch('site/en/stm32.html')