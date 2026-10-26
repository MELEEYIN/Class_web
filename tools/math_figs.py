# -*- coding: utf-8 -*-
"""
math_figs.py — 高数页的配图（内联 SVG，无外链、跟随深浅色）

图里颜色全部走 CSS 变量（var(--accent) / var(--ink-3) / var(--line)…），
所以同一张图在深色、浅色下都成立。

结构：FIGS[章号][节序号(从 0 开始)] = (说明, svg)
"""

W, H = 640, 272


def _svg(inner, h=H):
    return ('<svg viewBox="0 0 %d %d" class="figsvg" role="img" aria-label="示意图">%s</svg>'
            % (W, h, inner))


# 统一的样式片段：线、辅助线、文字
AX = 'stroke="var(--line-2)" stroke-width="1.4"'
DASH = 'stroke="var(--ink-4)" stroke-width="1.2" stroke-dasharray="5 4"'
CURVE = 'fill="none" stroke="var(--accent)" stroke-width="2.2"'
LBL = 'font-size="12" fill="var(--ink-3)" font-family="var(--sans)"'
LBL2 = 'font-size="11.5" fill="var(--ink-4)" font-family="var(--sans)"'

FIG_ED = _svg(
    # 坐标轴
    '<path d="M40 205 H610" %s/><path d="M70 225 V25" %s/>'
    '<path d="M604 200 l7 5 -7 5" fill="none" stroke="var(--line-2)" stroke-width="1.4"/>'
    # ε 带
    '<rect x="70" y="108" width="540" height="44" fill="var(--accent)" opacity=".08"/>'
    '<path d="M70 108 H610" %s/><path d="M70 152 H610" %s/>'
    # δ 带
    '<rect x="268" y="30" width="76" height="196" fill="var(--accent)" opacity=".07"/>'
    '<path d="M268 205 V30" %s/><path d="M344 205 V30" %s/>'
    # 曲线
    '<path d="M80 196 C170 190 210 168 268 150 C310 138 336 104 380 78 C450 40 520 34 600 32" %s/>'
    # 点与投影
    '<circle cx="306" cy="130" r="4" fill="var(--accent)"/>'
    '<path d="M306 130 V205" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 4"/>'
    '<path d="M306 130 H70" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 4"/>'
    '<circle cx="306" cy="205" r="3" fill="var(--accent)"/>'
    '<circle cx="70" cy="130" r="3" fill="var(--accent)"/>'
    # 文字
    '<text x="296" y="228" %s>x₀</text>'
    '<text x="286" y="100" %s>x₀ − δ</text>'
    '<text x="350" y="100" %s>x₀ + δ</text>'
    '<text x="52" y="134" %s>A</text>'
    '<text x="50" y="104" %s>A+ε</text>'
    '<text x="50" y="160" %s>A−ε</text>'
    '<text x="424" y="86" %s>y = f(x)</text>'
    '<text x="316" y="222" %s2>只要 |x − x₀| &lt; δ，就有 |f(x) − A| &lt; ε</text>'
    % (AX, AX, DASH, DASH, DASH, DASH, CURVE, LBL, LBL2, LBL2, LBL, LBL2, LBL2, LBL, LBL2),
    h=250
)


def fig_eps():
    return FIG_ED


FIGS = {
    # ---------------------------------------------------- 第一章
    1: {
        2: ("ε–δ 的样子：横着给 δ，竖着就得有 ε",
            FIG_ED),
        7: ("三种常见间断点：可去（挖个洞）、跳跃（左右不等）、无穷（冲向竖直渐近线）",
            _svg(
                # 三个小坐标系
                '<path d="M20 200 H190" %(ax)s/><path d="M40 215 V40" %(ax)s/>'
                '<path d="M20 200 H190" %(ax)s/><path d="M40 215 V40" %(ax)s/>'
                '<path d="M20 200 H190" %(ax)s/><path d="M40 215 V40" %(ax)s/>'
                % dict(ax=AX) +
                # 可去
                '<path d="M50 180 C80 150 90 120 108 108" %(c)s/>'
                '<path d="M108 108 C130 96 150 92 180 90" %(c)s/>'
                '<circle cx="108" cy="108" r="4.5" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>'
                '<text x="60" y="232" %(l)s>可去</text>'
                # 跳跃
                '<path d="M230 180 C260 160 275 152 290 150" %(c)s/>'
                '<path d="M300 132 C320 126 340 124 370 124" %(c)s/>'
                '<circle cx="290" cy="150" r="4" fill="var(--accent)"/>'
                '<circle cx="300" cy="132" r="4" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>'
                '<text x="272" y="232" %(l)s>跳跃</text>'
                # 无穷
                '<path d="M400 190 C430 186 450 150 452 130 C454 96 458 70 470 60" %(c)s/>'
                '<path d="M486 58 C500 70 504 120 506 200" %(c)s/>'
                '<path d="M468 30 V200" %(d)s/>'
                '<text x="452" y="232" %(l)s>无穷</text>'
                % dict(ax=AX, c=CURVE, d=DASH, l=LBL))),
    },

    # ---------------------------------------------------- 第二章
    2: {
        0: ("割线斜率的极限就是切线斜率：Δx → 0 时，割线转成切线",
            _svg(
                '<path d="M40 200 H610" %(ax)s/><path d="M70 220 V28" %(ax)s/>'
                '<path d="M110 190 C200 170 260 120 330 92 C410 60 500 44 600 40" %(c)s/>'
                # 两点
                '<circle cx="250" cy="128" r="4" fill="var(--accent)"/>'
                '<circle cx="400" cy="70" r="4" fill="var(--accent)"/>'
                # 割线
                '<path d="M200 148 L470 44" stroke="var(--warn)" stroke-width="1.8" stroke-dasharray="6 4"/>'
                # 切线
                '<path d="M180 176 L520 18" stroke="var(--accent)" stroke-width="1.8"/>'
                # 增量三角
                '<path d="M250 128 H400" %(d)s/><path d="M400 128 V70" %(d)s/>'
                '<text x="318" y="146" %(l2)s>Δx</text>'
                '<text x="406" y="104" %(l2)s>Δy</text>'
                '<text x="252" y="120" %(l)s>x₀</text>'
                '<text x="404" y="62" %(l)s>x₀ + Δx</text>'
                '<text x="150" y="60" %(l)s>切线：k = f′(x₀)</text>'
                '<text x="150" y="80" %(l2)s>割线：k = Δy/Δx → f′(x₀)</text>'
                % dict(ax=AX, c=CURVE, d=DASH, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第三章
    3: {
        0: ("罗尔（两端等高，中间必有水平切线）与拉格朗日（割线平行于某条切线）",
            _svg(
                '<path d="M40 200 H300" %(ax)s/><path d="M70 215 V35" %(ax)s/>'
                '<path d="M380 200 H620" %(ax)s/><path d="M400 215 V35" %(ax)s/>'
                # 罗尔
                '<path d="M95 60 C150 132 200 132 255 60" %(c)s/>'
                '<path d="M95 60 H255" %(d)s/>'
                '<path d="M120 96 H232" stroke="var(--warn)" stroke-width="1.8"/>'
                '<circle cx="176" cy="96" r="4" fill="var(--warn)"/>'
                '<text x="86" y="228" %(l)s>罗尔：f(a) = f(b)</text>'
                # 拉格朗日
                '<path d="M420 170 C470 90 520 90 585 45" %(c)s/>'
                '<path d="M420 170 L585 45" stroke="var(--ink-4)" stroke-width="1.4" stroke-dasharray="6 4"/>'
                '<path d="M455 108 L545 62" stroke="var(--warn)" stroke-width="1.8"/>'
                '<circle cx="497" cy="87" r="4" fill="var(--warn)"/>'
                '<text x="412" y="228" %(l)s>拉格朗日：f(b) − f(a) = f′(ξ)(b − a)</text>'
                % dict(ax=AX, c=CURVE, d=DASH, l=LBL))),
    },

    # ---------------------------------------------------- 第四章
    4: {
        1: ("三角代换之后画这个三角形，sin t、cos t、tan t 直接读成 x 的式子",
            _svg(
                '<path d="M180 200 H470" stroke="var(--ink-3)" stroke-width="2"/>'
                '<path d="M470 200 V60" stroke="var(--ink-3)" stroke-width="2"/>'
                '<path d="M180 200 L470 60" %(c)s/>'
                '<path d="M470 176 h24 v24" fill="none" stroke="var(--ink-4)" stroke-width="1.4"/>'
                '<path d="M228 200 A48 48 0 0 0 214 172" fill="none" stroke="var(--warn)" stroke-width="1.6"/>'
                '<text x="232" y="190" %(l)s>t</text>'
                '<text x="316" y="222" %(l)s>a</text>'
                '<text x="294" y="128" %(l)s>√(a² − x²)</text>'
                '<text x="482" y="140" %(l)s>x</text>'
                '<text x="386" y="40" %(l2)s>x = a sin t</text>'
                '<text x="120" y="140" %(l2)s>cos t = √(a² − x²)/a</text>'
                '<text x="120" y="162" %(l2)s>sin t = x/a，tan t = x/√(a² − x²)</text>'
                % dict(c=CURVE, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第五章
    5: {
        0: ("定积分就是曲边梯形的面积：把 [a, b] 切成小条，求和取极限",
            _svg(
                '<path d="M40 200 H610" %(ax)s/><path d="M70 215 V30" %(ax)s/>'
                '<path d="M120 200 C180 120 240 96 300 96 C380 96 430 60 500 52" %(c)s/>'
                '<path d="M120 200 L120 200" stroke="none"/>'
                '<path d="M120 200 V152 C150 140 180 116 210 104 V200 Z" fill="var(--accent)" opacity=".22"/>'
                '<path d="M210 200 V104 C240 100 270 96 300 96 V200 Z" fill="var(--accent)" opacity=".16"/>'
                '<path d="M300 200 V96 C340 96 370 78 400 70 V200 Z" fill="var(--accent)" opacity=".12"/>'
                '<path d="M400 200 V70 C440 62 470 56 500 52 V200 Z" fill="var(--accent)" opacity=".09"/>'
                '<path d="M120 200 H500" stroke="var(--accent)" stroke-width="2"/>'
                '<text x="110" y="222" %(l)s>a</text>'
                '<text x="494" y="222" %(l)s>b</text>'
                '<text x="150" y="240" %(l2)s>∫ f(x) dx = 这些小条面积的极限</text>'
                '<text x="380" y="150" %(l)s>y = f(x)</text>'
                % dict(ax=AX, c=CURVE, l=LBL, l2=LBL2)),),
    },

    # ---------------------------------------------------- 第六章
    6: {
        0: ("同一个旋转体两种算法：圆盘（横着切，πy²dx）与柱壳（竖着切，2πx·f(x)dx）",
            _svg(
                '<path d="M40 200 H300" %(ax)s/><path d="M70 215 V35" %(ax)s/>'
                '<path d="M380 200 H620" %(ax)s/><path d="M400 215 V35" %(ax)s/>'
                # 圆盘
                '<path d="M100 190 C130 92 200 92 235 190" %(c)s/>'
                '<path d="M100 190 H235" stroke="var(--accent)" stroke-width="2"/>'
                '<ellipse cx="168" cy="140" rx="34" ry="8" fill="var(--accent)" opacity=".25"/>'
                '<path d="M168 140 V190" %(d)s/>'
                '<text x="176" y="172" %(l2)s>y</text>'
                '<text x="96" y="228" %(l)s>圆盘法：πy²dx</text>'
                # 柱壳
                '<path d="M430 190 C460 96 530 96 566 190" %(c)s/>'
                '<path d="M430 190 H566" stroke="var(--accent)" stroke-width="2"/>'
                '<rect x="470" y="120" width="16" height="70" fill="var(--accent)" opacity=".3"/>'
                '<path d="M400 190 V120" %(d)s/>'
                '<path d="M400 190 H470" %(d)s/>'
                '<text x="424" y="182" %(l2)s>x</text>'
                '<text x="410" y="114" %(l2)s>f(x)</text>'
                '<text x="426" y="228" %(l)s>柱壳法：2πx·f(x)dx</text>'
                % dict(ax=AX, c=CURVE, d=DASH, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第七章
    7: {
        3: ("一阶线性方程的积分因子 e^∫P dx：把左边凑成导数，右边直接积分",
            _svg(
                '<path d="M40 200 H600" %(ax)s/><path d="M70 215 V35" %(ax)s/>'
                '<path d="M95 60 C180 80 240 130 300 158 C380 190 470 196 560 197" %(c)s/>'
                '<path d="M95 110 C180 122 250 156 320 176 C400 196 480 199 560 199" stroke="var(--teal)" stroke-width="1.8" fill="none" stroke-dasharray="7 4"/>'
                '<text x="120" y="80" %(l)s>y′ + P(x)y = Q(x)</text>'
                '<text x="120" y="100" %(l2)s>通解 = 齐次解 + 一个特解</text>'
                '<text x="400" y="188" %(l2)s>C 越大，曲线整体上移</text>'
                % dict(ax=AX, c=CURVE, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第八章
    8: {
        1: ("|a × b| 就是平行四边形的面积，方向由右手法则定；混合积则是平行六面体体积",
            _svg(
                '<path d="M120 190 L360 190 L450 120 L210 120 Z" fill="var(--accent)" opacity=".16" stroke="var(--accent)" stroke-width="1.8"/>'
                '<path d="M120 190 L210 120" stroke="var(--warn)" stroke-width="2.2"/>'
                '<path d="M120 190 L360 190" stroke="var(--teal)" stroke-width="2.2"/>'
                '<path d="M120 190 l7 -5 M120 190 l1 8" stroke="var(--warn)" stroke-width="1.6"/>'
                '<text x="212" y="112" %(l)s>a</text>'
                '<text x="300" y="210" %(l)s>b</text>'
                '<text x="300" y="150" %(l2)s>S = |a × b|</text>'
                '<path d="M470 60 V180" stroke="var(--ink-3)" stroke-width="1.6"/>'
                '<text x="478" y="126" %(l)s>h</text>'
                '<text x="120" y="52" %(l2)s>a ∥ b ⟺ a × b = 0（三点共线也用它）</text>'
                '<text x="120" y="72" %(l2)s>(a b c) = 0 ⟺ 三向量共面</text>'
                % dict(c=CURVE, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第九章
    9: {
        6: ("梯度垂直于等高线，指向函数增长最快的方向；方向导数就是它在 l 方向的投影",
            _svg(
                '<path d="M60 210 H600" %(ax)s/><path d="M90 225 V30" %(ax)s/>'
                # 等高线（椭圆）
                '<ellipse cx="300" cy="130" rx="200" ry="86" fill="none" stroke="var(--line-2)" stroke-width="1.4"/>'
                '<ellipse cx="300" cy="130" rx="140" ry="60" fill="none" stroke="var(--line-2)" stroke-width="1.4"/>'
                '<ellipse cx="300" cy="130" rx="80" ry="34" fill="none" stroke="var(--line-2)" stroke-width="1.4"/>'
                '<circle cx="300" cy="130" r="4" fill="var(--accent)"/>'
                # 梯度箭头（法向）
                '<path d="M300 130 L392 88" stroke="var(--accent)" stroke-width="2.4"/>'
                '<path d="M392 88 l-13 0 l6 -10 z" fill="var(--accent)"/>'
                # 方向 l
                '<path d="M300 130 L410 168" stroke="var(--warn)" stroke-width="2"/>'
                '<path d="M410 168 l-12 -2 l4 -9 z" fill="var(--warn)"/>'
                '<text x="398" y="80" %(l)s>grad f</text>'
                '<text x="416" y="184" %(l)s>方向 l</text>'
                '<text x="120" y="60" %(l2)s>∂f/∂l = grad f · e_l = |grad f| cos θ</text>'
                '<text x="120" y="80" %(l2)s>θ 越小增长越快，沿梯度方向最大</text>'
                % dict(ax=AX, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第十章
    10: {
        1: ("极坐标的面积元：dA = r dr dθ（不是 dr dθ，那个 r 是雅可比）",
            _svg(
                '<path d="M60 200 H600" %(ax)s/><path d="M120 220 V40" %(ax)s/>'
                # 扇形区域
                '<path d="M120 200 L360 120 A200 200 0 0 0 250 60 Z" fill="var(--accent)" opacity=".14" stroke="var(--accent)" stroke-width="1.4"/>'
                # 小面元
                '<path d="M300 143 L330 133 A150 150 0 0 0 316 116 Z" fill="var(--accent)" opacity=".4"/>'
                '<text x="336" y="140" %(l)s>r dθ</text>'
                '<text x="300" y="164" %(l2)s>dr</text>'
                '<text x="200" y="216" %(l)s>θ</text>'
                '<text x="150" y="120" %(l)s>r</text>'
                '<text x="380" y="80" %(l2)s>dxdy = r dr dθ</text>'
                '<text x="380" y="100" %(l2)s>圆域 / 含 x²+y² 的被积函数优先极坐标</text>'
                % dict(ax=AX, l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第十一章
    11: {
        2: ("格林公式：沿边界的环量（逆时针）等于区域内部「旋度」的二重积分",
            _svg(
                '<path d="M300 60 C420 60 480 110 480 150 C480 196 400 210 300 210 C200 210 120 192 120 148 C120 100 200 60 300 60 Z" fill="var(--accent)" opacity=".12" stroke="var(--accent)" stroke-width="2.2"/>'
                # 方向箭头
                '<path d="M470 130 l4 14 l-14 -4 z" fill="var(--accent)"/>'
                '<path d="M200 74 l-12 -2 l4 12 z" fill="var(--accent)"/>'
                # 挖洞
                '<circle cx="300" cy="140" r="34" fill="var(--surface-2)" stroke="var(--danger)" stroke-width="1.8"/>'
                '<path d="M332 122 a34 34 0 0 0 -8 -10" fill="none" stroke="var(--danger)" stroke-width="2"/>'
                '<text x="270" y="144" %(l2)s>奇点</text>'
                '<text x="352" y="212" %(l)s>L（正向：逆时针）</text>'
                '<text x="120" y="40" %(l2)s>∮ Pdx + Qdy = ∬ (∂Q/∂x − ∂P/∂y) dxdy</text>'
                '<text x="120" y="252" %(l2)s>有奇点就挖小圆，内边界取顺时针</text>'
                % dict(l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第十二章
    12: {
        2: ("高斯公式：闭曲面上的通量 = 内部散度的三重积分（曲面必须取外侧）",
            _svg(
                '<ellipse cx="300" cy="130" rx="150" ry="86" fill="var(--accent)" opacity=".1" stroke="var(--accent)" stroke-width="2"/>'
                '<path d="M300 130 L300 44" stroke="var(--accent)" stroke-width="0"/>'
                # 向外箭头
                ''.join('<path d="M%d %d L%d %d" stroke="var(--teal)" stroke-width="1.8" marker-end=""/>'
                        % (300 + 150 * __import__('math').cos(a), 130 + 86 * __import__('math').sin(a),
                           300 + 190 * __import__('math').cos(a), 130 + 112 * __import__('math').sin(a))
                        for a in [0.5, 1.1, 1.9, 2.5, 3.6, 4.3, 5.2, 5.9]) +
                '<circle cx="300" cy="130" r="4" fill="var(--accent)"/>'
                '<text x="306" y="126" %(l2)s>Ω</text>'
                '<text x="470" y="70" %(l)s>外侧法向量</text>'
                '<text x="120" y="40" %(l2)s>∯ P dydz + Q dzdx + R dxdy = ∭ (P_x + Q_y + R_z) dV</text>'
                '<text x="120" y="252" %(l2)s>曲面不闭：补面后用高斯，再减去补面上的积分</text>'
                % dict(l=LBL, l2=LBL2))),
    },

    # ---------------------------------------------------- 第十三章
    13: {
        3: ("幂级数的收敛半径 R：|x| < R 绝对收敛，|x| > R 发散，两个端点要单独判",
            _svg(
                '<path d="M60 150 H600" %(ax)s/>'
                '<path d="M300 150 V96" stroke="var(--accent)" stroke-width="1.4"/>'
                '<rect x="180" y="120" width="240" height="60" fill="var(--accent)" opacity=".12"/>'
                '<path d="M180 150 h-6 M420 150 h6" stroke="var(--ink-4)" stroke-width="2"/>'
                '<circle cx="180" cy="150" r="5" fill="var(--surface-2)" stroke="var(--warn)" stroke-width="2"/>'
                '<circle cx="420" cy="150" r="5" fill="var(--surface-2)" stroke="var(--warn)" stroke-width="2"/>'
                '<text x="292" y="146" %(l)s>0</text>'
                '<text x="164" y="182" %(l)s>−R</text>'
                '<text x="406" y="182" %(l)s>R</text>'
                '<text x="240" y="112" %(l2)s>绝对收敛</text>'
                '<text x="446" y="146" %(l2)s>发散</text>'
                '<text x="64" y="146" %(l2)s>发散</text>'
                '<text x="120" y="216" %(l2)s>R = lim |aₙ / aₙ₊₁|；端点代入化回常数项级数再判</text>'
                % dict(ax=AX, l=LBL, l2=LBL2))),
    },
}
