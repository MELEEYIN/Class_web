#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
site/acm/python/_render.py —— 章节 Markdown → 站点静态页（+ 同步侧栏数据）

为什么有这个脚本：
    正文由写作者用 Markdown 维护（规范见同目录 _STYLE.md，一手事实来源是
    NN-english-slug.md），而站点必须是**纯静态 HTML**（无构建步骤、能部署到
    Cloudflare、双击 file:// 也能看）。这个脚本就是那一步：md 进，html 出。

一条命令做三件事：
    1) 每个 site/acm/python/NN-english-slug.md → 同名的 .html，骨架取自 _template.html
       （侧栏、面包屑、上下篇、页内目录、已读进度、深浅色全部由站点脚本接管）
    2) 重写 site/js/learn-nav.js 里 py-syntax.items 的自动区块
       —— 章节号、标题、一句话简介、顺序、锚点全部从 md 读，杜绝两处不一致
    3) 不动 _build/（校验脚本）、不动 examples/（示例代码）、不动别人的章节

用法（仓库根目录，或任意目录都行）：
    python site/acm/python/_render.py            # 全部章节
    python site/acm/python/_render.py 03         # 只渲染第 3 章
    python site/acm/python/_render.py 03 05 07   # 渲染多章
    python site/acm/python/_render.py --no-nav   # 只渲染页面，不改导航

只依赖标准库。Python 3.8+。
"""

import html
import io
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))          # site/acm/python
SITE = os.path.dirname(os.path.dirname(HERE))              # site
NAV_JS = os.path.join(SITE, 'js', 'learn-nav.js')          # site/js/learn-nav.js
TPL = os.path.join(HERE, '_template.html')

NAV_BEGIN = '@chapters:begin'
NAV_END = '/* @chapters:end'

# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------


def read(path):
    with io.open(path, 'r', encoding='utf-8') as f:
        return f.read().replace('\r\n', '\n').replace('\r', '\n')


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def esc(s):
    return html.escape(s, quote=False)


def slugify(text):
    t = unicodedata.normalize('NFKC', text).strip().lower()
    t = re.sub(r'[^\w\u4e00-\u9fff]+', '-', t)
    return t.strip('-') or 'sec'


def inline(s):
    """行内语法：`code`、**粗**、*斜*、[文字](链接)。

    先把 code span 换成占位符再做转义与强调匹配，这样 `**` 能跨过行内代码配对
    （正文里「把 **3.11 起 `str()` 会抛错**」这种写法很常见）。
    """
    hold = []

    def keep(chunk):
        hold.append('<code>' + esc(chunk) + '</code>')
        return '\x00%d\x00' % (len(hold) - 1)

    t = re.sub(r'`([^`]*)`', lambda m: keep(m.group(1)), s)
    t = esc(t)
    t = re.sub(r'\[([^\]\n]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![*\w\x00])\*([^*\n]+?)\*(?![*\w])', r'<em>\1</em>', t)
    t = re.sub(r'\x00(\d+)\x00', lambda m: hold[int(m.group(1))], t)
    return t


# ---------------------------------------------------------------------------
# Markdown → HTML 正文
# ---------------------------------------------------------------------------

RE_FENCE = re.compile(r'^\s*```+\s*([A-Za-z0-9_+#.-]*)\s*$')
RE_HEAD = re.compile(r'^(#{1,6})\s+(.+?)\s*#*\s*$')
RE_QUOTE = re.compile(r'^\s*>\s?(.*)$')
RE_UL = re.compile(r'^(\s*)[-*+]\s+(.*)$')
RE_OL = re.compile(r'^(\s*)(\d+)[.)]\s+(.*)$')
RE_HR = re.compile(r'^\s*(?:-{3,}|\*{3,}|_{3,})\s*$')
RE_TSEP = re.compile(r'^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$')
RE_NUM = re.compile(r'^(\d+(?:[.．]\d+)*)[.)、]?\s+(.*)$')
RE_SAMPLE = re.compile(r'^#\s*示例\s*[：:]\s*(.+?)\s*$')
RE_SNIPPET = re.compile(r'^#\s*片段\s*$')

BOXES = (
    ('💡', 'tip'), ('提示', 'tip'), ('技巧', 'tip'),
    ('⚠', 'warn'), ('注意', 'warn'), ('易错', 'warn'),
    ('✅', 'ok'), ('小结', 'ok'), ('要点', 'ok'),
    ('本质', 'essence'),
)

CODE_CLASS = {
    'pycon': 'pycon',
    'python': 'py',
    'py': 'py',
    'text': 'out',
    'bash': 'shell',
    'shell': 'shell',
    'powershell': 'shell',
    'console': 'shell',
    'json': 'json',
    'html': 'html',
}


def head_id(level, text, used):
    m = RE_NUM.match(text)
    if m and m.group(1):
        num = m.group(1).replace('．', '.').replace('.', '-')
        base = 's' + num
    else:
        base = slugify(text)
    if level >= 3 and m is None:
        base = 's-' + base
    cand, i = base, 2
    while cand in used:
        cand = '%s-%d' % (base, i)
        i += 1
    used.add(cand)
    return cand


def split_table_row(line):
    """按 | 切单元格，但不切 `code span` 里的竖线（`&&` / `||` 这类必须整块保留）。"""
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    cells, buf, tick = [], [], False
    for ch in line:
        if ch == '`':
            tick = not tick
        if ch == '|' and not tick:
            cells.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
    cells.append(''.join(buf))
    if len(cells) > 1 and not cells[-1].strip() and line.rstrip().endswith('|'):
        cells.pop()
    return [c.strip() for c in cells]


def render_table(lines):
    rows = [split_table_row(l) for l in lines if not RE_TSEP.match(l)]
    if not rows:
        return ''
    head, body = rows[0], rows[1:]
    # 表格外面套一层横向滚动容器：窄屏（≤390px）里 8 列的对照表塞不下，
    # 让它自己横向滚，而不是把整页撑出横向滚动条。
    out = ['<div class="table-wrap">', '<table>', '<thead><tr>']
    for c in head:
        out.append('<th>' + inline(c) + '</th>')
    out.append('</tr></thead>')
    if body:
        out.append('<tbody>')
        for r in body:
            out.append('<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in r) + '</tr>')
        out.append('</tbody>')
    out.append('</table>')
    out.append('</div>')
    return '\n'.join(out)


def box_kind(text):
    t = text.strip().lstrip('*_ ').replace('*', '').strip()
    for key, kind in BOXES:
        if t.startswith(key) or t.startswith(kind):
            return kind
    return None


def render_quote(lines):
    """引用块 → 提示框。首行的 💡/⚠️/✅/本质 标签交给 CSS 的 ::before 显示，正文里去掉。"""
    body = [l.strip() for l in lines]
    kind = box_kind(body[0]) if body else None
    if not kind:
        inner = ''.join('<p>' + inline(l) + '</p>' for l in body if l)
        return '<blockquote>' + inner + '</blockquote>'

    first = body[0]
    first = re.sub(r'^[\s*_]*(?:💡|⚠️|⚠|✅)\s*', '', first)
    for _ in range(2):
        first = re.sub(r'^[\s*_]*(?:提示|技巧|注意|易错|小结|要点|本质)[\s*_]*[：:]?[\s*_]*',
                       '', first)
    first = first.strip(' *_')
    body = ([first] if first.strip() else []) + body[1:]

    paras, subs, buf = [], [], []
    for l in body:
        if not l:
            if buf:
                paras.append(' '.join(buf))
                buf = []
            continue
        m = RE_UL.match(l) or RE_OL.match(l)
        if m:
            if buf:
                paras.append(' '.join(buf))
                buf = []
            subs.append(inline(m.groups()[-1].strip()))
        else:
            buf.append(l)
    if buf:
        paras.append(' '.join(buf))

    inner = ''.join('<p>' + inline(p) + '</p>' for p in paras)
    if subs:
        inner += '<ul>' + ''.join('<li>' + s + '</li>' for s in subs) + '</ul>'
    return '<div class="box ' + kind + '">' + inner + '</div>'


def render_code(lang, lines):
    """返回 (html, kind) —— kind 用于和紧随其后的 text 块配对成一个 figure。"""
    lines = [l for l in lines]
    while lines and not lines[-1].strip():
        lines.pop()
    caption = None

    if lang in ('python', 'py'):
        if lines:
            m = RE_SAMPLE.match(lines[0].strip())
            if m:
                caption = m.group(1)
                lines = lines[1:]
            elif RE_SNIPPET.match(lines[0].strip()):
                lines = lines[1:]
    while lines and not lines[0].strip():
        lines = lines[1:]

    cls = CODE_CLASS.get(lang or '', 'code')
    code = esc('\n'.join(lines))
    pre = '<pre class="%s"><code>%s</code></pre>' % (cls, code)

    if caption:
        fig = ('<figure class="code"><figcaption class="code-src">示例 · '
               + '<code>' + esc(caption) + '</code></figcaption>' + pre)
        return fig, 'figopen'
    return pre, 'pre'


def render_md(md):
    """整篇 md → (title, essence, body_html)。"""
    lines = md.split('\n')
    title = ''
    essence = ''
    body = []

    # 先抽标题与「本质」一行（模板里要当 <h1> 和导语用）
    for i, l in enumerate(lines):
        m = re.match(r'^#\s+(.+?)\s*$', l)
        if m and not title:
            raw = m.group(1).strip()
            m2 = re.match(r'^\d{1,3}\s*[·.、:：]\s*(.+)$', raw)
            title = (m2.group(1) if m2 else raw).strip()
        if not essence:
            m3 = re.match(r'^\s*>\s*\*\*本质\*\*\s*[：:]\s*(.+?)\s*$', l)
            if m3:
                essence = m3.group(1).strip()
    if not essence:
        for i, l in enumerate(lines):
            if re.match(r'^\s*>\s*\*\*本质\*\*', l):
                j = i + 1
                buf = []
                while j < len(lines) and lines[j].strip().startswith('>'):
                    buf.append(lines[j].strip().lstrip('>').strip())
                    j += 1
                essence = ' '.join(x for x in buf if x).strip()
                break

    used = set()
    ess_dropped = False
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.strip()

        # 空行
        if not s:
            i += 1
            continue

        # 代码块
        m = RE_FENCE.match(line)
        if m:
            lang = (m.group(1) or '').lower()
            buf = []
            i += 1
            while i < n and not RE_FENCE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1
            htmlc, kind = render_code(lang, buf)
            if kind == 'figopen':
                # 紧跟的 text 块 = 这份脚本的真实输出，并进同一个 figure
                j = i
                while j < n and not lines[j].strip():
                    j += 1
                mm = RE_FENCE.match(lines[j]) if j < n else None
                if mm and (mm.group(1) or '').lower() in ('text', 'txt', 'output', ''):
                    out = []
                    j += 1
                    while j < n and not RE_FENCE.match(lines[j]):
                        out.append(lines[j])
                        j += 1
                    j += 1
                    while out and not out[-1].strip():
                        out.pop()
                    htmlc += ('<div class="out-wrap"><div class="out-lbl">运行输出</div>'
                              '<pre class="out"><code>' + esc('\n'.join(out)) + '</code></pre></div>')
                    i = j
                body.append(htmlc + '</figure>')
            else:
                body.append(htmlc)
            continue

        # 标题
        m = RE_HEAD.match(line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1:
                i += 1
                continue                      # h1 已经在页头，正文里不再重复
            lv = min(max(level, 2), 4)
            hid = head_id(lv, text, used)
            body.append('<h%d id="%s">%s</h%d>' % (lv, hid, inline(text), lv))
            i += 1
            continue

        # 分隔线
        if RE_HR.match(line):
            body.append('<hr>')
            i += 1
            continue

        # 表格
        if '|' in line and i + 1 < n and RE_TSEP.match(lines[i + 1]):
            buf = []
            while i < n and '|' in lines[i] and lines[i].strip():
                buf.append(lines[i])
                i += 1
            body.append(render_table(buf))
            continue

        # 引用 / 提示框
        if RE_QUOTE.match(line):
            buf = []
            while i < n and RE_QUOTE.match(lines[i]):
                buf.append(RE_QUOTE.match(lines[i]).group(1))
                i += 1
            htmlq = render_quote(buf)
            # 「本质」那一行已经在页头当导语用了，正文里不再重复一遍
            if essence and not ess_dropped and 'class="box essence"' in htmlq:
                ess_dropped = True
                continue
            body.append(htmlq)
            continue

        # 列表
        if RE_UL.match(line) or RE_OL.match(line):
            ordered = RE_OL.match(line) is not None
            items = []
            while i < n:
                cur = lines[i]
                if not cur.strip():
                    j = i + 1
                    while j < n and not lines[j].strip():
                        j += 1
                    nxt = lines[j] if j < n else ''
                    if RE_UL.match(nxt) or RE_OL.match(nxt):
                        i = j
                        continue
                    break
                m = RE_UL.match(cur) or RE_OL.match(cur)
                if m:
                    items.append(inline(m.groups()[-1].strip()))
                    i += 1
                    continue
                if items and (cur.startswith('  ') or cur.startswith('\t')):
                    items[-1] += ' ' + inline(cur.strip())
                    i += 1
                    continue
                break
            tag = 'ol' if ordered else 'ul'
            body.append('<%s>%s</%s>' % (tag, ''.join('<li>' + x + '</li>' for x in items), tag))
            continue

        # 段落
        buf = []
        while i < n:
            cur = lines[i]
            if not cur.strip() or RE_FENCE.match(cur) or RE_HEAD.match(cur) \
               or RE_QUOTE.match(cur) or RE_HR.match(cur) or (RE_UL.match(cur) or RE_OL.match(cur)):
                break
            if '|' in cur and i + 1 < n and RE_TSEP.match(lines[i + 1]):
                break
            buf.append(cur.strip())
            i += 1
        if buf:
            body.append('<p>' + inline(' '.join(buf)) + '</p>')

    return title, essence, '\n\n'.join(x for x in body if x)


# ---------------------------------------------------------------------------
# 套模板出页
# ---------------------------------------------------------------------------


def plain(s):
    """去掉行内标记，供 meta description / 纯文本场景使用。"""
    t = re.sub(r'`([^`]*)`', r'\1', s or '')
    t = t.replace('**', '').replace('*', '').strip()
    return re.sub(r'\s+', ' ', t)


def inline_concat(text):
    """多行文字按行内语法拼成一段（导语用）。"""
    parts = [re.sub(r'\s+', ' ', l).strip() for l in (text or '').split('\n')]
    return ' '.join(inline(p) for p in parts if p)


def render_page(no, slug, md_text):
    title, essence, body = render_md(md_text)
    if not title:
        title = '%02d' % no
    page_id = 'py-%02d' % no
    meta = plain(essence) or ('第 %d 章 · %s：Python 语法教程' % (no, title))

    tpl = read(TPL)
    tpl = re.sub(r'<!--CONTRACT-START-->.*?<!--CONTRACT-END-->\s*', '', tpl, flags=re.S)

    tpl = tpl.replace('<body data-learn-page="py-01">',
                      '<body data-learn-page="%s">' % page_id)
    tpl = tpl.replace('<meta name="description" content="">',
                      '<meta name="description" content="%s">' % html.escape(meta, quote=True))
    tpl = tpl.replace('<title>Python 语法教程 · 编程学习</title>',
                      '<title>第 %d 章 · %s · Python 语法教程 · 编程学习</title>' % (no, esc(title)))
    tpl = tpl.replace('<h1 id="learnTitle"></h1>',
                      '<h1 id="learnTitle">第 %d 章 · %s</h1>' % (no, esc(title)))
    tpl = tpl.replace('<p class="lead"></p>',
                      '<p class="lead">%s</p>' % inline_concat(essence))

    m = re.search(r'(<article data-learn-content>)(.*?)(\n\s*</article>)', tpl, re.S)
    if not m:
        raise SystemExit('模板里找不到 <article data-learn-content> … </article>')
    tpl = tpl[:m.start(2)] + '\n\n' + body + '\n\n    ' + tpl[m.end(2):]

    out = os.path.join(HERE, '%02d-%s.html' % (no, slug))
    write(out, tpl)
    return out, title, essence


# ---------------------------------------------------------------------------
# 同步 site/js/learn-nav.js 的章节目录
# ---------------------------------------------------------------------------


def js_str(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ')


def short_desc(s, limit=52):
    """导航里的一句话简介：去掉行内标记、只留第一句、超长截断。"""
    t = re.sub(r'`([^`]*)`', r'\1', s or '')
    t = t.replace('**', '').replace('*', '').strip()
    m = re.match(r'^(.*?[。！？])', t)
    if m and len(m.group(1)) <= limit + 14:
        t = m.group(1)
    if len(t) > limit:
        t = t[:limit].rstrip('，、；：,;:—- ') + '…'
    return t


def collect():
    """扫描所有 NN-slug.md，按章号排序返回 (no, slug, title, essence)。"""
    found = {}
    for name in os.listdir(HERE):
        m = re.match(r'^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$', name)
        if not m:
            continue
        no, slug = int(m.group(1)), m.group(2)
        title, essence, _ = render_md(read(os.path.join(HERE, name)))
        found[no] = (no, slug, title or slug, essence)
    return [found[k] for k in sorted(found)]


def sync_nav(entries):
    src = read(NAV_JS)
    i1 = src.find(NAV_BEGIN)
    i2 = src.find(NAV_END)
    if i1 < 0 or i2 < 0:
        raise SystemExit('learn-nav.js 里找不到 @chapters:begin / @chapters:end 标记')
    start = src.find('*/', i1) + 2
    lines = []
    for no, slug, title, essence in entries:
        lines.append("            { id: 'py-%02d', no: %d, title: '%s', href: 'python/%02d-%s.html',"
                     % (no, no, js_str(title), no, slug))
        lines.append("              desc: '%s' }," % js_str(short_desc(essence)))
    block = '\n' + '\n'.join(lines) + '\n            ' if lines else '\n            '
    out = src[:start] + block + src[i2:]

    # 顺手把分组那句说明里的章数改掉（页面上的「N 章」全都由这里来，不写死）
    # 00-xxx.md 是「导读」，不算一章；章数只数 no >= 1 的
    n_ch = sum(1 for e in entries if e[0] >= 1)
    if entries:
        note = '共 %d 章 · 按写作顺序陆续上线' % n_ch
        out = re.sub(r"(note:\s*')[^']*陆续上线[^']*(')",
                     lambda m: m.group(1) + note + m.group(2), out)

    write(NAV_JS, out)
    return n_ch


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def main(argv):
    want = set()
    do_nav = True
    for a in argv[1:]:
        if a in ('--no-nav', '-n'):
            do_nav = False
        elif a.isdigit():
            want.add(int(a))
        else:
            raise SystemExit('用法：python _render.py [章号 …] [--no-nav]')

    allc = collect()
    if want:
        todo = [c for c in allc if c[0] in want]
    else:
        todo = allc
    if not todo:
        print('没找到可渲染的章节（site/acm/python/NN-english-slug.md）')
        return 0

    for no, slug, title, essence in todo:
        md = read(os.path.join(HERE, '%02d-%s.md' % (no, slug)))
        out, t, e = render_page(no, slug, md)
        print('[OK] %-34s ← %02d-%s.md  %s' % (os.path.basename(out), no, slug, t))

    if do_nav:
        cnt = sync_nav(allc)
        print('[OK] site/js/learn-nav.js 章节目录已同步（%d 章）' % cnt)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))