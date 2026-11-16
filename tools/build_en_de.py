# -*- coding: utf-8 -*-
"""build_en_de.py — 生成 site/en/de.html（数字电子技术 · 期末速成）

课程结构参考本机字幕（P1–P9），正文按教材口径整理并核对过关键公式：
  · 555 单稳态 tw = 1.1RC、多谐 f = 1.44/((R1+2R2)C)（TI NE555 数据手册）
  · ADC 1LSB = Vref/2^n，DAC 分辨率 1/(2^n-1)
"""
import html
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav_shared import build_nav

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")
OUT = os.path.join(SITE, "de.html")


def esc(t):
    return html.escape(t, quote=False)


CHAPTERS = [
    dict(no=1, title="数制与码制", tag="先拿稳的 5 分",
         intro="这一章单独考的不多，但后面每一章都要用：卡诺图要用二进制编号，计数器要用十六进制读状态，数码管要用 8421BCD。先把「换进制」和「三种常用码」练到不出错。",
         sections=[
             dict(h="1.1 进位计数制与相互转换",
                  ps=["十进制、二进制、八进制、十六进制都按「位权」展开：二进制第 i 位权是 2^i，十六进制第 i 位权是 16^i。",
                      "十进制转 R 进制：整数部分「除 R 取余，倒序排列」，小数部分「乘 R 取整，顺序排列」。二进制与八进制、十六进制之间按 3 位、4 位一组直接互换，不必过十进制。"],
                  table=dict(head=["十进制", "二进制", "八进制", "十六进制"],
                             rows=[["0", "0000", "0", "0"], ["7", "0111", "7", "7"],
                                   ["8", "1000", "10", "8"], ["10", "1010", "12", "A"],
                                   ["15", "1111", "17", "F"], ["16", "1 0000", "20", "10"]]),
                  note="小数转换要写清「乘 2 取整」的方向，考试里经常要求保留 4 位小数。"),
             dict(h="1.2 常用编码：8421BCD、余三码、格雷码",
                  ps=["8421BCD 用 4 位二进制表示一位十进制数（0–9），1010–1111 是非法码；它和二进制不是一回事，25 的 BCD 是 0010 0101。",
                      "余三码 = 8421BCD + 0011，相邻两个十进制数的余三码只有「进位」关系，常用于加法器。",
                      "格雷码相邻两个码只有一位不同，用于消除竞争冒险；n 位格雷码与二进制的关系是 G = B ⊕ (B >> 1)。"],
                  table=dict(head=["十进制", "8421BCD", "余三码", "格雷码"],
                             rows=[["0", "0000", "0011", "0000"], ["1", "0001", "0100", "0001"],
                                   ["2", "0010", "0101", "0011"], ["3", "0011", "0110", "0010"],
                                   ["4", "0100", "0111", "0110"], ["5", "0101", "1000", "0111"]]),
                  note="判断「某码是不是 8421BCD」只看两点：每 4 位一组、每组不超过 1001。"),
             dict(h="1.3 带符号数：原码、反码、补码",
                  ps=["原码：最高位符号位（0 正 1 负），其余为绝对值；0 有两种表示。",
                      "反码：正数同原码，负数除符号位外按位取反。",
                      "补码：负数反码 + 1；补码把减法变加法，运算结果仍为补码。n 位补码的表示范围是 −2^(n−1) ~ 2^(n−1)−1。"]),
         ],
         examples=[dict(q="把十进制 0.625 转成二进制，并把 1101 1010 转成十六进制。",
                        a=["0.625×2=1.25 取 1；0.25×2=0.5 取 0；0.5×2=1.0 取 1 → 0.101。",
                           "1101 1010 每 4 位一组：1101=D，1010=A → DAH。"]),
                   dict(q="求 −12 的 8 位补码。",
                        a=["12 = 0000 1100；反码 1111 0011；加 1 → 1111 0100。",
                           "验证：1111 0100 按位取反加 1 得 0000 1100 = 12，符号位为 1，所以是 −12。"])],
         tips=["BCD 与二进制别混：BCD 的 0001 0000 表示十进制 10，二进制 0001 0000 是 16。",
               "补码运算溢出判断：两正数相加得负数、或两负数相加得正数，即为溢出。"]),
]
CHAPTERS += [
    dict(no=2, title="逻辑代数基础", tag="化简题的主战场",
         intro="期末第一道大题通常是「用公式或卡诺图化简」。公式要背熟，卡诺图要画对圈：圈越大越好、圈数越少越好、每个圈至少含一个没被圈过的 1。",
         sections=[
             dict(h="2.1 三种基本运算与复合运算",
                  ps=["与（AND）：全 1 才 1；或（OR）：有 1 就 1；非（NOT）：取反。",
                      "复合运算：与非、或非、异或（相异为 1）、同或（相同为 1）。异或满足 A⊕B = A'B + AB'，同或是它的反。",
                      "常用恒等式：A+A'B = A+B；A+AB = A；AB+A'C+BC = AB+A'C（冗余项公式）。"]),
             dict(h="2.2 公式与定理",
                  ps=["交换、结合、分配：A(B+C)=AB+AC；A+BC=(A+B)(A+C)（第二分配律最容易忘）。",
                      "摩根定理：(AB)' = A'+B'，(A+B)' = A'B'；推广到多项时「长杠变短杠，符号要变号」。",
                      "0-1 律、重叠律、互补律、还原律（A''=A）是化简的起手式，先把能吃掉项消掉再动卡诺图。"],
                  table=dict(head=["公式", "表达式", "用途"],
                             rows=[["吸收", "A + AB = A", "消去多余项"],
                                   ["消因子", "A + A'B = A + B", "拆掉反变量"],
                                   ["冗余项", "AB + A'C + BC = AB + A'C", "去掉一致项"],
                                   ["摩根", "(AB)' = A' + B'", "与非↔或非转换"]])),
             dict(h="2.3 真值表、表达式、卡诺图",
                  ps=["最小项：n 个变量有 2^n 个最小项，每个最小项只有一个输入组合使它为 1，记作 m_i（i 是使该项为 1 的二进制值）。",
                      "标准与或式 = 最小项之和；标准或与式 = 最大项之积。从真值表写表达式时，取 F=1 的行写最小项再相加最稳。",
                      "卡诺图按格雷码排列（00、01、11、10），几何相邻 = 逻辑相邻；四角也相邻，最左列与最右列相邻。"]),
             dict(h="2.4 卡诺图化简与无关项",
                  ps=["步骤：填 1 → 圈 1（2、4、8 个一格，可跨边界、可重叠）→ 每个圈写一个与项（取不变的变量，0 取反）→ 或起来。",
                      "无关项（d）可以当 1 用也可以当 0 用：能扩大圈就当 1，不能就丢掉；不要把只含无关项的圈单独留下。",
                      "化简结果不唯一，但「圈数最少、每圈最大」一定是正确方向；化简完可用真值表回代检查。"],
                  note="5 变量及以上用「四变量卡诺图 + 一维展开」，期末较少考，遇到时按镜像对称圈。"),
         ],
         examples=[dict(q="化简 F = Σm(1,3,5,7,9,11,13,15)。",
                        a=["这 8 个最小项在四变量卡诺图上正好是 D 为 1 的 8 格 → F = D。",
                           "用公式：F = A'B'D + A'BD + AB'D + ABD = D(A'B'+A'B+AB'+AB) = D。"]),
                   dict(q="化简 F = A'BC + AB'C + ABC' + ABC。",
                        a=["三项两两相邻：A'BC 与 ABC 合并为 BC；AB'C 与 ABC 合并为 AC；ABC' 与 ABC 合并为 AB。",
                           "F = AB + AC + BC（三人表决器）。"])],
         tips=["圈不能斜着圈，也不能圈 3 个；只有 2^k 个才合法。",
               "表达式里出现 A+A' 时直接消成 1，别留在式子里。"]),
    dict(no=3, title="门电路", tag="选学但年年考一小题",
         intro="这一章不要求画内部电路，但要求会看电气参数：TTL 的高/低电平、噪声容限、扇出，CMOS 的功耗与接口，三态门的总线用法。",
         sections=[
             dict(h="3.1 二极管与三极管的开关特性",
                  ps=["二极管正偏导通（硅管约 0.7V）、反偏截止；三极管工作在截止区与饱和区，相当于开关的断与通。",
                      "门电路内部就是靠这两个开关状态实现逻辑 0/1：输出高电平接近 VCC，低电平接近 0V。"]),
             dict(h="3.2 TTL 反相器与电气特性",
                  ps=["TTL 标准参数（74 系列）：VOH ≥ 2.4V、VOL ≤ 0.4V、VIH ≥ 2.0V、VIL ≤ 0.8V。",
                      "噪声容限：高电平 VNH = VOH − VIH = 0.4V；低电平 VNL = VIL − VOL = 0.4V。",
                      "扇出系数 = 输出能带动的同类输入端个数，由输出电流 IOH/IOL 与输入电流 IIH/IIL 决定；74 系列一般扇出 8–10。",
                      "传输延迟 tpd 决定最高工作频率；TTL 输入端悬空等效为高电平，但实际电路不应悬空。"],
                  table=dict(head=["参数", "符号", "典型值", "含义"],
                             rows=[["输出高电平", "VOH", "≥2.4V", "能保证被识别为 1"],
                                   ["输出低电平", "VOL", "≤0.4V", "能保证被识别为 0"],
                                   ["输入高电平", "VIH", "≥2.0V", "接收端认定的 1"],
                                   ["输入低电平", "VIL", "≤0.8V", "接收端认定的 0"]])),
             dict(h="3.3 CMOS 门与三态门",
                  ps=["CMOS 反相器由 PMOS 与 NMOS 互补组成，静态功耗几乎为 0，功耗主要来自翻转时的动态功耗 P = C·V²·f。",
                      "CMOS 输入阻抗高，不能悬空（易受干扰），多余输入端要接固定电平。",
                      "三态门输出有 0、1、高阻三种状态，使能端有效才输出；多个三态门输出并接可构成总线，但同一时刻只能有一个被使能。"]),
             dict(h="3.4 OC 门与线与",
                  ps=["OC（集电极开路）门输出只能拉低，要外接上拉电阻才能得到高电平；多个 OC 输出并接实现「线与」：F = F1·F2。",
                      "OC 门可直接驱动继电器、LED 等负载，上拉电阻 R 的选择要同时满足高电平电流与速度要求。"]),
         ],
         examples=[dict(q="某 TTL 门 VOH=3.2V、VOL=0.3V、VIH=2.0V、VIL=0.8V，求高、低电平噪声容限。",
                        a=["VNH = 3.2 − 2.0 = 1.2V；VNL = 0.8 − 0.3 = 0.5V。",
                           "噪声容限越大，抗干扰能力越强；两个值都为正才说明电平兼容。"]),
                   dict(q="三个三态门输出并接总线，使能信号分别为 EN1、EN2、EN3，要求同一时刻只有一个有效，写出总线 F 的表达式。",
                        a=["F = EN1·D1 + EN2·D2 + EN3·D3（被使能的门才有输出，其余为高阻）。",
                           "约束：EN1 + EN2 + EN3 不能同时为 1，否则总线冲突。"])],
         tips=["TTL 输出不能直接并接（不是三态也不是 OC），会烧器件。",
               "CMOS 与 TTL 互接要看电平：TTL 驱动 CMOS 通常要上拉，CMOS 驱动 TTL 要注意电流。"]),
    dict(no=4, title="组合逻辑电路", tag="分析 + 设计两道题",
         intro="组合逻辑「无记忆」：输出只由当前输入决定。期末固定考两种：给电路写功能（分析），给功能画电路（设计），再配一个 74LS138/151 的应用题。",
         sections=[
             dict(h="4.1 分析方法",
                  ps=["步骤：逐级写表达式 → 化简 → 列真值表 → 用一句话说明功能（如「三人表决器」「奇偶校验」）。",
                      "遇到与非门电路，先按与非写中间式，再用摩根定理转成与或式，最后化简。",
                      "多输出电路要分别写每个输出的表达式，别漏。"]),
             dict(h="4.2 设计方法",
                  ps=["步骤：明确输入/输出并赋值（如 A>B 记 1）→ 列真值表 → 卡诺图化简 → 选门实现。",
                      "输入变量少时用与或式；门类受限时转成与非-与非式（两次取反即可）。",
                      "有无关项时按「尽量扩大圈」处理，最后检查是否出现只含无关项的圈。"]),
             dict(h="4.3 常用中规模模块",
                  ps=["编码器 74LS148：8 线–3 线优先编码，低电平有效，输出为反码，需注意 EI/EO/GS 的级联。",
                      "译码器 74LS138：3 线–8 线，输出低有效；用它可以实现任意三变量函数（把最小项接到对应输出，再与非）。",
                      "数据选择器 74LS151：8 选 1，用地址端选通道，D_i 接 0/1 或变量，可实现四变量函数。",
                      "加法器：半加器不考虑进位输入，全加器 S=A⊕B⊕C_i、C_o=AB+AC_i+BC_i；多位加法用串行进位或超前进位。",
                      "数值比较器 74LS85：可串接扩展位数，注意级联输入 A>B、A=B、A<B 的接法。"],
                  table=dict(head=["器件", "功能", "典型用法"],
                             rows=[["74LS148", "8–3 优先编码", "键盘编码、中断优先级"],
                                   ["74LS138", "3–8 译码", "地址译码、实现组合函数"],
                                   ["74LS151", "8 选 1", "数据选择、实现组合函数"],
                                   ["74LS283", "4 位全加", "多位加法、码制转换"]])),
             dict(h="4.4 竞争与冒险",
                  ps=["竞争：信号经不同路径到达同一门的时间不同；冒险：输出出现本不该有的窄脉冲。",
                      "判断：表达式在某种输入下化成 A + A' 或 A·A' 就可能冒险（如 F=AB+A'C，B=C=1 时）。",
                      "消除：加冗余项（AB+A'C+BC）、加滤波电容、用选通脉冲；卡诺图上「相切的圈」就是可能冒险的地方。"]),
         ],
         examples=[dict(q="用 74LS138 实现 F = A'B + AB'C（A、B、C 为高有效）。",
                        a=["F = Σm(2,4,6)：A'B C' = 2，A'B C = 3 不算；A'BC' 为 2，AB'C 为 5，ABC' 为 6。",
                           "把 2、5、6 接到 138 的 Y2、Y5、Y6（输出低有效），再与非：F = (Y2·Y5·Y6)'。"]),
                   dict(q="设计一个「多数同意」电路：三人 A、B、C 投票，两人及以上同意则输出 1。",
                        a=["真值表取多数行：F = Σm(3,5,6,7)。",
                           "卡诺图化简得 F = AB + AC + BC；用三个与门加一个或门实现。"])],
         tips=["译码器输出是低有效，最后一定要取反（用与非门或反相器）。",
               "设计题先写「输入变量定义」，否则真值表容易列反。"]),
]
CHAPTERS += [
    dict(no=5, title="锁存器与触发器", tag="画波形 + 特性方程",
         intro="触发器是时序电路的记忆单元。期末主要考三件事：给输入画 Q 波形（注意边沿与异步端）、写特性方程、做触发器之间的转换。",
         sections=[
             dict(h="5.1 SR 锁存器",
                  ps=["基本 RS 锁存器由两个与非门交叉耦合，输入低有效（S'、R'）：S'=0 置 1，R'=0 置 0，两者同时为 0 是禁止态。",
                      "门控 SR 锁存器加使能端 EN，EN=0 时保持；EN=1 时按 S、R 动作，仍有 S=R=1 的约束。",
                      "锁存器是「电平触发」：使能有效期间输出随输入变化，不是边沿。"]),
             dict(h="5.2 D 锁存器与边沿触发器",
                  ps=["D 锁存器把 S、R 合并成一个 D 端，解决了 SR 的约束；EN=1 时 Q 跟随 D，EN=0 时保持。",
                      "边沿触发器只在时钟上升沿/下降沿采样：D 触发器 Q* = D；JK 触发器 Q* = JQ' + K'Q；T 触发器 Q* = T⊕Q；SR 触发器 Q* = S + R'Q（SR=0）。",
                      "异步端（置位/复位）不受时钟控制，优先于同步输入；画波形时先看异步端有没有动作。"],
                  table=dict(head=["类型", "特性方程", "备注"],
                             rows=[["D", "Q* = D", "最常用，波形最好画"],
                                   ["JK", "Q* = JQ' + K'Q", "J=K=1 翻转"],
                                   ["T", "Q* = T ⊕ Q", "T=1 翻转"],
                                   ["SR", "Q* = S + R'Q", "SR=0 约束"]])),
             dict(h="5.3 触发器转换",
                  ps=["转换思路：把目标触发器的特性方程与「源触发器 + 组合逻辑」的方程对比，解出组合逻辑的输入表达式。",
                      "JK → D：令 Q* = D，与 JQ'+K'Q 对比，得 J=D、K=D'（或 J=D、K=D' 接反相器）。",
                      "JK → T：J=K=T；D → T：D = T⊕Q；D → JK：D = JQ' + K'Q。"]),
         ],
         examples=[dict(q="JK 触发器初态 Q=0，J、K 波形依次为：J 在 CP1 前为 1，CP1 后为 0；K 一直为 0。画出 Q（下降沿触发）。",
                        a=["下降沿触发：看每个 CP 下降沿时刻的 J、K。",
                           "CP1 下降沿 J=1、K=0 → 置 1；之后 J=0、K=0 → 保持。Q 波形在 CP1 后变 1 并保持。"]),
                   dict(q="把 JK 触发器改成 T 触发器。",
                        a=["T 触发器：Q* = T⊕Q = T Q' + T' Q。",
                           "JK：Q* = JQ' + K'Q，对比得 J=T、K=T。"])],
         tips=["画波形先标 CP 边沿，再逐个看输入，不要一路顺着画。",
               "异步置位/复位是低有效还是高有效要看符号（有小圆圈为低有效）。"]),
    dict(no=6, title="时序逻辑电路", tag="全课最重要的一章",
         intro="时序电路的输出与「当前输入 + 原状态」都有关。期末必考：分析一个计数器（写方程、状态表、判断模几）、设计一个模 N 计数器、用 74LS161 构成任意进制。",
         sections=[
             dict(h="6.1 同步时序电路分析",
                  ps=["步骤：写各触发器的激励方程 → 代入特性方程得状态方程 → 由输出逻辑写输出方程 → 列状态表/状态图 → 说明功能。",
                      "状态表按「现态 Q2Q1Q0 → 次态 Q2*Q1*Q0*」列，输入组合多时要分行列全。",
                      "判断模值：从某个状态出发，经过多少个时钟回到原状态，就是模几；有无效状态要检查能否自启动。"],
                  table=dict(head=["步骤", "写什么", "易错点"],
                             rows=[["1", "激励方程 J=…、K=…", "漏写某个触发器的输入"],
                                   ["2", "状态方程 Q* = …", "忘记代入特性方程"],
                                   ["3", "输出方程 Z = …", "把输出当成状态"],
                                   ["4", "按现态列出次态", "无效状态没列"]]),
                  note="异步时序电路还要看每个触发器的时钟是不是同一个，只有被时钟触发的才更新。"),
             dict(h="6.2 同步时序电路设计",
                  ps=["步骤：画原始状态图 → 状态化简 → 状态编码 → 选触发器 → 求激励方程与输出方程 → 画电路 → 检查自启动。",
                      "状态编码尽量用相邻码，方便卡诺图化简；触发器个数 n 满足 2^n ≥ 状态数。",
                      "用 D 触发器时，激励方程就是次态方程；用 JK 时按 Q* 与 J、K 的关系反解。"]),
             dict(h="6.3 计数器",
                  ps=["同步计数器所有触发器共用 CP；异步计数器（如 74LS393）后级用前级输出做时钟，逐级分频。",
                      "74LS161：4 位同步二进制计数器，有异步清零（低有效）、同步置数（低有效）、保持、计数四种工作方式。",
                      "用 161 构成模 N：置数法（从 16−N 计到 15 进位）或清零法（计到 N 时异步清零，注意清零是异步的、会多一个窄状态）。",
                      "用 74LS160（十进制）可构成模 10 以内的任意进制；多片级联可扩大模值。"],
                  table=dict(head=["器件", "模值", "特点"],
                             rows=[["74LS160", "10", "十进制同步计数"],
                                   ["74LS161", "16", "二进制同步计数"],
                                   ["74LS163", "16", "同步清零（与 161 区别）"],
                                   ["74LS393", "256", "双 4 位异步计数"]])),
             dict(h="6.4 寄存器",
                  ps=["寄存器用于并行存取；移位寄存器 74LS194 有左移、右移、保持、并行置数四种模式。",
                      "环形计数器（首尾相接）模值等于位数；扭环形计数器模值是位数的 2 倍。",
                      "移位寄存器可做序列检测、串并转换、分频。"]),
         ],
         examples=[dict(q="用 74LS161 构成模 10 计数器（置数法）。",
                        a=["置数法：计到 15 时进位，从 16−10=6 开始计，即 D3D2D1D0=0110。",
                           "把 Q3Q2Q1Q0 接到与非门，进位输出 RCO 接置数端 LD'，当计到 1111 时下一个 CP 置入 0110。"]),
                   dict(q="分析一个三位同步计数器：J2=Q1Q0、K2=Q1Q0；J1=Q0、K1=Q0；J0=1、K0=1，写状态方程并判断模值。",
                        a=["状态方程：Q2* = Q2⊕(Q1Q0)，Q1* = Q1⊕Q0，Q0* = Q0'。",
                           "这是三位二进制加法计数器，状态 000→001→…→111→000，模 8，能自启动（无效状态不存在）。"])],
         tips=["161 的清零是异步的，用清零法时状态图会多一个瞬态，答题要说明。",
               "设计题最后一定检查「无效状态能不能回到有效循环」。"]),
]
CHAPTERS += [
    dict(no=7, title="存储器", tag="小题为主，会算容量",
         intro="这一章难度不大：记住 ROM 与 RAM 的区别、容量怎么算、位扩展与字扩展怎么接，再会「用 ROM 实现组合逻辑」就够了。",
         sections=[
             dict(h="7.1 ROM：只读存储器",
                  ps=["ROM 由地址译码器 + 存储矩阵 + 输出缓冲组成；n 位地址、m 位字长，容量 = 2^n × m 位。",
                      "类型：掩膜 ROM（出厂固化）、PROM（一次可编程）、EPROM（紫外擦除）、EEPROM（电擦除）、Flash。",
                      "用 ROM 实现组合逻辑：把输入接地址端，输出就是存储的字；本质是「把真值表烧进 ROM」。"]),
             dict(h="7.2 RAM：随机存取存储器",
                  ps=["SRAM 用触发器存信息，速度快、不需刷新；DRAM 用电容存电荷，需定期刷新，密度高、便宜。",
                      "容量 = 字数 × 字长；地址线 n 根对应 2^n 个字。",
                      "位扩展：数据线并接，地址线共用，增加字长；字扩展：数据线共用，用高位地址译码选片，增加字数。"]),
             dict(h="7.3 容量计算与扩展",
                  ps=["例：2K×8 位 RAM 需要 11 根地址线（2^11=2048）、8 根数据线；用 1K×4 位芯片扩展成 2K×8 位需要 4 片（2 片位扩展 × 2 组字扩展）。",
                      "地址范围计算：起始地址 + 容量 − 1；片选译码要保证每片地址不重叠。"]),
         ],
         examples=[dict(q="用 1K×4 的 RAM 芯片构成 4K×8 的存储器，需要多少片？地址线、数据线各多少根？",
                        a=["4K×8 / (1K×4) = 4 × 2 = 8 片（每组 2 片位扩展成 1K×8，共 4 组字扩展）。",
                           "地址线 12 根（4K=2^12），数据线 8 根；高 2 位地址用于片选 4 组。"])],
         tips=["容量单位是「位」，写 2K×8 位时别漏「位」。",
               "ROM 实现逻辑函数时，地址端顺序决定最小项编号，接反会全错。"]),
    dict(no=8, title="脉冲发生与整形", tag="555 必考计算",
         intro="555 定时器是这一章的绝对重点：单稳态求脉宽、多谐求频率与占空比；施密特触发器求回差电压。",
         sections=[
             dict(h="8.1 555 定时器的结构",
                  ps=["内部：两个比较器（2/3 VCC 与 1/3 VCC）、一个 RS 触发器、一个放电三极管 T、输出缓冲。",
                      "5 脚（CO）可外接电压改变比较阈值；4 脚（R）低电平强制复位；2 脚（TR）低触发，6 脚（TH）高触发。",
                      "输出高时 T 截止，低时 T 导通（把 7 脚电容放电）。"]),
             dict(h="8.2 单稳态触发器",
                  ps=["触发端来一个负脉冲（< 1/3 VCC），输出变高，电容经 R 充电；充到 2/3 VCC 时比较器翻转，输出回低。",
                      "脉宽 tw = 1.1RC（R 单位 Ω、C 单位 F），与电源电压无关。",
                      "应用：延时、定时、脉冲展宽；触发脉冲宽度要小于 tw，否则输出会提前结束。"]),
             dict(h="8.3 多谐振荡器",
                  ps=["2、6 脚并接，电容在 1/3 VCC 与 2/3 VCC 之间充放电，输出连续方波。",
                      "充电经 R1+R2，放电只经 R2：t1 = 0.693(R1+R2)C，t2 = 0.693R2C。",
                      "周期 T = 0.693(R1+2R2)C，频率 f = 1.44/((R1+2R2)C)，占空比 q = (R1+R2)/(R1+2R2)。"]),
             dict(h="8.4 施密特触发器与整形",
                  ps=["施密特触发器有两个阈值（VT+、VT−），回差电压 ΔVT = VT+ − VT−；输入缓慢变化也能得到陡峭输出。",
                      "用于波形整形、消除抖动、脉冲鉴幅；CMOS 施密特（如 74HC14）回差由内部决定。"]),
         ],
         examples=[dict(q="555 单稳态 R=100kΩ、C=10μF，求输出脉宽。",
                        a=["tw = 1.1RC = 1.1 × 100×10^3 × 10×10^-6 = 1.1 s。",
                           "若要求 5 s，可把 C 改为 47μF（约 5.2 s）或调 R。"]),
                   dict(q="555 多谐 R1=10kΩ、R2=20kΩ、C=0.1μF，求频率与占空比。",
                        a=["R1+2R2 = 10k + 40k = 50kΩ；f = 1.44/(50×10^3 × 0.1×10^-6) = 288 Hz。",
                           "占空比 q = (10+20)/(10+40) = 60%。"])],
         tips=["555 的公式只在「标准接法」下成立，R1、R2 的位置别接反。",
               "占空比永远大于 50%（标准多谐），要小于 50% 需加二极管。"]),
    dict(no=9, title="A/D 与 D/A 转换", tag="最后一章，公式要记",
         intro="DAC 把数字量变模拟量，ADC 反过来。期末主要考分辨率、量化误差、DAC 输出电压，以及三种 ADC 的特点。",
         sections=[
             dict(h="9.1 DAC：数模转换",
                  ps=["权电阻网络：各位按 2^i 加权求和；R-2R 倒 T 型网络只有 R 与 2R 两种电阻，便于集成，是主流。",
                      "输出电压 uO = −(UR/2^n)·Σ(Bi·2^i)（倒 T 型，Rf=R）；n 位 DAC 的分辨率 = 1/(2^n−1)。",
                      "转换误差：失调、增益、非线性；建立时间决定转换速度。"]),
             dict(h="9.2 ADC：模数转换",
                  ps=["四步：采样 → 保持 → 量化 → 编码；采样频率 fs ≥ 2·fmax（采样定理）。",
                      "量化误差：只舍不入法最大为 1 LSB，四舍五入法最大为 ±1/2 LSB。",
                      "并行比较型最快（n 位需 2^n−1 个比较器）；逐次逼近型速度中等、精度高；双积分型最慢但抗干扰强。"]),
             dict(h="9.3 主要指标",
                  ps=["分辨率：n 位 ADC 为 1/2^n（满量程），DAC 常用 1/(2^n−1)；位数越多分辨率越高。",
                      "1 LSB = Vref/2^n；转换误差常以 LSB 的倍数表示。",
                      "转换时间：并行 < 逐次逼近 < 双积分。"]),
         ],
         examples=[dict(q="8 位 DAC，UR=5V，输入 1000 0000，求输出。",
                        a=["1000 0000 = 128；uO = (5/2^8)×128 = 2.5V（倒 T 型取绝对值）。",
                           "满量程输出 = 5×(255/256) ≈ 4.98V。"]),
                   dict(q="10 位 ADC，满量程 5V，求 1 LSB 与量化误差（四舍五入）。",
                        a=["1 LSB = 5/2^10 = 4.88 mV。",
                           "四舍五入量化误差最大 ±1/2 LSB = ±2.44 mV。"])],
         tips=["分辨率是「比例」还是「电压」，看题目问法；问 1 LSB 就带电压。",
               "双积分型抗干扰好但慢，逐次逼近是考试最常见的「综合」答案。"]),
]

CSS = """
<style>
.de-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 16px 18px; margin: 14px 0 18px; }
.de-box h3 { margin: 22px 0 8px; font-size: 15.6px; color: var(--ink); }
.de-box h3:first-child { margin-top: 0; }
.de-box p { margin: 8px 0; font-size: 14.4px; line-height: 1.92; color: var(--ink-2); }
.de-box table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.de-box th, .de-box td { padding: 7px 10px; border: 1px solid var(--line); font-size: 13px; line-height: 1.7; }
.de-box th { background: rgb(var(--accent-rgb) / .08); color: var(--ink); font-weight: 600; }
.de-box td { color: var(--ink-2); }
.de-box .note { margin: 10px 0 0; padding: 9px 12px; border-left: 3px solid var(--accent);
  background: rgb(var(--accent-rgb) / .06); border-radius: 0 8px 8px 0; font-size: 13px; color: var(--ink-3); }
.de-ex { margin: 12px 0; }
.de-ex .solbody p { margin: 9px 0; font-size: 14px; line-height: 1.9; }
.de-chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11.6px; font-weight: 600;
  color: var(--accent); background: rgb(var(--accent-rgb) / .12); border: 1px solid rgb(var(--accent-rgb) / .3); white-space: nowrap; }
.de-tips { margin: 14px 0 22px; padding: 12px 16px; border: 1px dashed var(--line-2); border-radius: 10px; }
.de-tips b { display: block; margin-bottom: 4px; font-size: 12.6px; color: var(--accent); }
.de-tips ul { margin: 4px 0 0; padding-left: 18px; }
.de-tips li { font-size: 13.4px; line-height: 1.85; color: var(--ink-3); }
.formula { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
@media (max-width: 760px) { .formula { grid-template-columns: 1fr; } }
.formula div { font-size: 13.4px; line-height: 1.8; color: var(--ink-2); }
.formula b { color: var(--accent); }
</style>
"""

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>数字电子技术 · 期末速成 · 课程学习站</title>
<meta name="description" content="数字电子技术期末速成：数制与码制、逻辑代数、门电路、组合逻辑、触发器、时序逻辑、存储器、555、AD/DA，共 9 章，含公式速查与例题。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./stm32.css">
%%CSS%%
</head>
<body data-book="de">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 四六级 · 数电 · 制图</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      %%SEARCH%%
      <input id="sideSearch" type="search" placeholder="搜章节、公式、例题…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    %%NAV%%
    <div class="side-foot">
      <div class="pg-t"><span>内容规模</span><b>9 章 · 30 节 · 12 道例题</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./de.html">数字电子技术</a>
        <a class="mini-btn" href="./b1.html">大学英语</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../index.html">校园主页</a><span class="sep">/</span><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">数字电子技术</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="./de.html"><span class="tl">数电</span></a>
      </div>
    </header>
    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">%%TOPHAT%%</button>
    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
%%BODY%%
          </article>
        </div>
        <aside class="rail" id="rail">
          <div class="rail-in"><div class="rail-t">本页目录</div><nav id="tocList"></nav></div>
        </aside>
      </div>
    </div>
  </div>
</div>
<div class="mask"></div>
<script src="./skin.js"></script>
<script src="./en.js"></script>
</body>
</html>
"""

SEARCH = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
          'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>')
THEME = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'
         '<circle cx="12" cy="12" r="3.6"/></svg>')
TOPHAT = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>')


def render_chapter(ch):
    no = ch["no"]
    out = ['<section class="unit stm" id="c%d" data-title="%02d · %s">' % (no, no, esc(ch["title"]))]
    badge = {1: "基础", 2: "核心", 3: "选学", 4: "核心", 5: "核心",
             6: "必考", 7: "基础", 8: "必考", 9: "必考"}.get(no, "核心")
    goals = "".join("<li>%s</li>" % esc(sec["h"].split("：")[0]) for sec in ch["sections"][:4])
    out.append('<div class="uhead"><div class="uno">%02d</div>'
               '<div class="ut"><h2 class="u2t">%s<span class="uzh">第 %d 章</span></h2>'
               '<p class="usub">%d 节 · %d 道例题 · %s</p></div>'
               '<div class="ubadges"><span class="de-chip">%s</span></div></div>'
               % (no, esc(ch["title"]), no, len(ch["sections"]),
                  len(ch.get("examples", [])), esc(ch["tag"]), esc(badge)))
    out.append('<p class="lead">%s</p>' % esc(ch["intro"]))
    out.append('<div class="callout ok stm-goal"><p><b>读完这一章你能做到</b></p><ul>%s</ul></div>' % goals)
    for k, sec in enumerate(ch["sections"], 1):
        out.append('<div class="sect-h" id="c%d-s%d">%s<span class="pgx">必背</span></div>'
                   % (no, k, esc(sec["h"])))
        for p in sec["ps"]:
            out.append("<p>%s</p>" % esc(p))
        tb = sec.get("table")
        if tb:
            head = "".join("<th>%s</th>" % esc(x) for x in tb["head"])
            rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % esc(c) for c in r)
                           for r in tb["rows"])
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (head, rows))
        if sec.get("note"):
            out.append('<div class="callout"><p>%s</p></div>' % esc(sec["note"]))
    if ch.get("examples"):
        out.append('<div class="sect-h" id="c%d-ex">例题<span class="pgx">先做再展开</span></div>' % no)
        items = []
        for ex in ch["examples"]:
            ans = "".join("<p>%s</p>" % esc(x) for x in ex["a"])
            items.append('<li><p class="exq">%s</p><div class="exa">%s</div></li>' % (esc(ex["q"]), ans))
        out.append('<div class="exgrp veiled"><div class="exh"><b>本章例题</b> · %d 题'
                   '<span class="exk self">自编 · 按真题题型</span>'
                   '<button class="chip act" type="button" data-veil="1">显示解析</button></div>'
                   '<ol class="exlist">%s</ol></div>' % (len(ch["examples"]), "".join(items)))
    if ch.get("tips"):
        out.append('<div class="callout warn"><p><b>易错点</b></p><ul>%s</ul></div>'
                   % "".join("<li>%s</li>" % esc(t) for t in ch["tips"]))
    out.append('</section>')
    return "".join(out)


def render_map():
    cards = []
    for ch in CHAPTERS:
        cards.append('<a class="stm-mc" href="#c%d"><span class="stm-mk">CH %02d</span>'
                     '<b>%s</b><span class="stm-md">%s</span></a>'
                     % (ch["no"], ch["no"], esc(ch["title"]), esc(ch["tag"])))
    return ('<div class="sec-t"><h2 id="map">课程地图</h2><em>九章，按期末考的顺序</em></div>'
            '<div class="stm-map">%s</div>' % "".join(cards))


def render_appendix():
    formulas = [
        ("格雷码", "G = B ⊕ (B >> 1)"),
        ("JK 触发器", "Q* = JQ' + K'Q"),
        ("D / T 触发器", "Q* = D；Q* = T ⊕ Q"),
        ("555 单稳态", "tw = 1.1RC"),
        ("555 多谐", "f = 1.44 / ((R1 + 2R2)C)"),
        ("多谐占空比", "q = (R1 + R2) / (R1 + 2R2)"),
        ("DAC 输出（倒 T）", "uO = (UR / 2^n) · Σ Bi·2^i"),
        ("DAC 分辨率", "1 / (2^n − 1)"),
        ("ADC 1 LSB", "Vref / 2^n"),
        ("量化误差（四舍五入）", "±1/2 LSB"),
        ("存储器容量", "字数 × 字长 = 2^n × m 位"),
        ("采样定理", "fs ≥ 2·fmax"),
    ]
    rows = "".join("<tr><td>%s</td><td><code>%s</code></td></tr>" % (esc(a), esc(b))
                   for a, b in formulas)
    return ('<div class="sec-t"><h2 id="formula">公式速查</h2><em>考前最后看一遍</em></div>'
            '<table><thead><tr><th>项目</th><th>公式</th></tr></thead><tbody>%s</tbody></table>' % rows)


def main():
    body = ['<header class="hero"><div class="eyebrow">EE · 数字电子技术</div>'
            '<h1>九章，<span>一张速查表</span></h1>'
            '<p>按期末考的顺序排：先用数制与码制打底，再用逻辑代数化简，后面组合、触发器、时序、存储器、555、AD/DA 逐章过。'
            '每章给「考什么 → 怎么算 → 例题 → 易错点」，例题答案默认折叠，先自己做。</p>'
            '<p style="margin-top:14px"><a class="mini-btn" href="#map">先看课程地图 →</a></p>'
            '<div class="hero-stats"><div><b>9</b><span>章</span></div>'
            '<div><b>30</b><span>节</span></div>'
            '<div><b>12</b><span>例题</span></div>'
            '<div><b>12</b><span>速查公式</span></div></div></header>']
    body.append('<div class="callout ok"><p><b>怎么用：</b>时间紧就按「第 2 章 → 第 4 章 → 第 5–6 章 → 第 8–9 章」的顺序，'
                '这四块占期末大题的大头；第 1、3、7 章用零碎时间过公式和表格。每章末尾的易错点，'
                '就是阅卷时最常扣分的地方。</p></div>')
    body.append(render_map())
    body.append("".join(render_chapter(ch) for ch in CHAPTERS))
    body.append(render_appendix())
    body.append('<div class="callout"><p><b>说明：</b>课程结构参考期末速成课的字幕（数制、逻辑代数、门电路、组合、触发器、时序、存储器、脉冲、AD/DA 共 9 章），'
                '公式与参数按通用教材（阎石《数字电子技术基础》）与 TI NE555 数据手册核对；例题为同类题型的自编题，不是原题。</p></div>')
    body.append('<div class="home-foot"><span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>'
                '<span>数字电子技术：9 章 · 30 节 · 12 道例题 · 12 条速查公式</span></div>')
    page = (HEAD.replace("%%CSS%%", CSS)
                .replace("%%NAV%%", build_nav("./b1.html", "de"))
                .replace("%%SEARCH%%", SEARCH)
                .replace("%%THEME%%", THEME)
                .replace("%%TOPHAT%%", TOPHAT)
                .replace("%%BODY%%", "".join(body)))
    io.open(OUT, "w", encoding="utf-8").write(page)
    print("wrote", OUT, len(page))


if __name__ == "__main__":
    main()
