# -*- coding: utf-8 -*-
"""把「电子与单片机资料库」入口补进首页、标准库页与 HAL 页（只加导航/卡片，不改正文）。"""
import io

ELEC_A = ('<a class="nv-i" href="./electronics.html"><span class="no">ELC</span>'
          '<span class="tt">电子与单片机资料库 · 12 套</span><span class="mk"></span></a>')

ELEC_CARD = """              <a class="path" href="./electronics.html">
                <span class="pk">电子与单片机资料库 · 12 套</span>
                <b>电路 · 数电 · 51 · STM32 · HAL · 微机</b>
                <p>从整站离线包里完整收进 12 套电子与单片机教程：邱关源《电路》12 章、数字电子技术、时序逻辑、51 单片机 35 章、51 汇编、51 前置、微机原理 12 篇、STM32 深度版 22 章 / 江协版 15 章 49 节、TIM 定时器 13 节、蓝桥杯 G431、F103C8T6 HAL 14 章，共 23 个页面。保留原教程的章节分页、搜索、深色模式与学习进度，与本站 STM32 标准库/HAL 两门短课互为补充。</p>
                <span class="go">打开资料库 →</span>
              </a>

"""


def patch_nav(p):
    s = io.open(p, encoding='utf-8', newline='').read()
    n0 = len(s)
    if '<!--/stm32-nav-->' in s and 'class="nv-i" href="./electronics.html"' not in s:
        s = s.replace('<!--/stm32-nav-->', ELEC_A + '<!--/stm32-nav-->', 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print(p, n0, '->', len(s))


def patch_home():
    p = 'site/en/index.html'
    s = io.open(p, encoding='utf-8', newline='').read()
    n0 = len(s)
    anchor = ('<span class="go">打开 HAL 课程 →</span>\n'
              '              </a>\n')
    if anchor in s and 'class="path" href="./electronics.html"' not in s:
        s = s.replace(anchor, anchor + ELEC_CARD, 1)
    elif 'class="path" href="./electronics.html"' not in s:
        anchor2 = ('<span class="go">打开 STM32 课程 →</span>\n'
                   '              </a>\n')
        if anchor2 in s:
            s = s.replace(anchor2, anchor2 + ELEC_CARD, 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('home', n0, '->', len(s))


def patch_root():
    p = 'site/index.html'
    s = io.open(p, encoding='utf-8', newline='').read()
    n0 = len(s)
    s = s.replace('STM32 标准库 19 课 + HAL 24 课）',
                  'STM32 标准库 19 课 + HAL 24 课 + 电子与单片机资料库 12 套）')
    s = s.replace('单片机 43 课', '单片机 43 课 · 电子资料库 12 套')
    s = s.replace('HAL 24 课从 CubeMX 建工程讲到 CAN/低功耗/提高篇，每课都带可编译代码与练习。',
                  'HAL 24 课从 CubeMX 建工程讲到 CAN/低功耗/提高篇，每课都带可编译代码与练习；'
                  '另有「电子与单片机资料库」12 套离线教程（电路 12 章、数电、51、STM32、微机等）。')
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('root', n0, '->', len(s))


if __name__ == '__main__':
    patch_home()
    patch_nav('site/en/index.html')
    patch_nav('site/en/stm32.html')
    patch_nav('site/en/stm32-hal.html')
    patch_root()