# -*- coding: utf-8 -*-
"""
build_en_b1.py — 生成 site/en/b1.html（第 1 册 · 课内习题对齐版）

做法：
  1. 从旧版 b1.html 里把 6 个单元的 M1–M5 正文原样搬出来（内容没有重写，只换外壳）；
  2. M6「练习与自测」整段重写：WE Learn 任务链 → 教材原题（真实翻译题）→ 过渡练习 → 单元自测；
  3. 输出 page：套 acm 的 shell.css 外壳（侧栏 / 顶栏 / 右目录 / 阅读进度）。

用法：python tools/build_en_b1.py
"""
import io
import os
import re
import html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")
# 旧版页面（M1–M5 正文的原文出处）。改版前的存档放在 tools/legacy/，只给这个脚本取素材，
# 不会部署到线上；如果它丢了，M1–M5 可以直接从生成的 b1.html 里手改。
OLD = os.path.join(ROOT, "tools", "legacy", "b1.html")
OUT = os.path.join(SITE, "b1.html")

# ======================================================================
# 0. 单元资料（标题、主题名、口径）
# ======================================================================
UNIT_META = [
    dict(no=1, uid="u1", en="College Life", zh="大学生活",
         t1="College Life", t2="What University Taught Me",
         verdict=("off", "官方口径"), name_known=True),
    dict(no=2, uid="u2", en="Understanding Relationships", zh="理解人际关系",
         t1="Understanding Relationships", t2="Improving Relationships",
         verdict=("off", "官方口径"), name_known=True),
    dict(no=3, uid="u3", en="Holidays and Traditions", zh="节日与传统",
         t1="Universal Themes of Holidays", t2="Traditional Chinese Festivals",
         verdict=("top", "话题补全"), name_known=False),
    dict(no=4, uid="u4", en="Leisure", zh="休闲与娱乐",
         t1="Leisure", t2="Hobbies and Their Price",
         verdict=("top", "话题补全"), name_known=False),
    dict(no=5, uid="u5", en="Language Learning", zh="语言学习",
         t1="Why I Taught Myself 20 Languages", t2="Language Learners Who Changed the World",
         verdict=("off", "官方口径"), name_known=False),
    dict(no=6, uid="u6", en="Food and Culture", zh="食物与文化",
         t1="The Food Chains That Link Us All", t2="Holding on to Heritage",
         verdict=("off", "官方口径"), name_known=False),
]

# ======================================================================
# 1. 真实翻译题（题面 + 教材给出的关键词 + 参考译文 + 结构对照）
#    来源：《领航大学英语·综合教程 1》课后 Translation，逐字录入
# ======================================================================
TRANS = {
    1: dict(
        kw=["educational policy", "morally", "intellectually", "physically",
            "socialist consciousness", "compulsory education", "formulate",
            "social sciences", "natural sciences", "empty talk"],
        zh=[
            "教育是发展科学技术、培养人才的基础。我们的教育方针，应该使每一个受教育者在德育、智育、体育几方面都得到发展，成为有社会主义觉悟、有文化的劳动者。",
            "因此，要继续普及全国九年义务教育，制定科学和技术长远发展规划。",
            "我们必须广泛利用现代科学技术的成就，坚持社会科学和自然科学并重。一定要少说空话，多做工作。教育发展的道路是漫长的，但是我们已经坚定地走上了这条道路。",
        ],
        ref=[
            "Education is the foundation for scientific and technological advancement and personnel training. Our educational policy must enable everyone who receives an education to develop morally, intellectually and physically and become a worker with both socialist consciousness and culture.",
            "Therefore, we should continue to make our nine-year compulsory education universal across the country. We should formulate a long-term program designed to develop science and technology.",
            "We must make use of the achievements of modern science and technology on a wide scale, and lay equal stress on social sciences and natural sciences. There must be less empty talk and more hard work. The road to educational development is long but we are firmly on it.",
        ],
        seg=[
            ("教育是……的基础", "Education is the foundation for …",
             "「是……的基础」固定用 be the foundation for，不用 be the base of；两个并列宾语用 and 直连：scientific and technological advancement and personnel training。"),
            ("使每一个受教育者……都得到发展", "must enable everyone who receives an education to develop …",
             "「使某人做某事」→ enable sb. to do sth.；「受教育者」用 who 从句限定 everyone，比 everyone educated 清楚；德智体对应三个副词 morally / intellectually / physically，因为它们修饰 develop。"),
            ("成为有社会主义觉悟、有文化的劳动者", "and become a worker with both socialist consciousness and culture",
             "汉语两个定语合并成 with both A and B 后置；worker 用单数泛指一类人，不用 workers。"),
            ("普及九年义务教育", "make our nine-year compulsory education universal …",
             "「普及」不用 popularize，教材口径是 make sth. universal（形容词作宾补）。"),
            ("制定科学和技术长远发展规划", "formulate a long-term program designed to develop science and technology",
             "「制定」用 formulate；「长远发展规划」= long-term program；designed to 分词后置，交代这个规划是干什么的。"),
            ("广泛利用……成就", "make use of the achievements of … on a wide scale",
             "「广泛」不修饰 use，而是拉出来做状语 on a wide scale 放句末，这是本单元 Translation 技巧（Conversion I）里最常考的一处。"),
            ("坚持社会科学和自然科学并重", "lay equal stress on social sciences and natural sciences",
             "「并重」= lay/place equal stress on，比 pay attention to both 更书面，也是本单元唯一不建议替换的固定搭配。"),
            ("一定要少说空话，多做工作", "There must be less empty talk and more hard work",
             "汉语动词句 → there be + 比较级，主语从「人」换成「话」和「工作」，这就是「转译法」：换主语、换词性，不换意思。"),
            ("道路是漫长的，但我们已经坚定地走上了这条道路", "The road … is long but we are firmly on it",
             "第二次出现的「这条道路」用 it 回指，避免重复名词；「坚定地」用 firmly 作状语。"),
        ],
    ),
    2: dict(
        kw=["interpersonal relationship", "take / accept criticism", "take / accept responsibility",
            "maturity", "colleague", "confront", "ego", "prickly"],
        zh=[
            "有时候，处理好人际关系在职业中非常重要。人际交往能力是一种善于听取别人的意见，体察别人需求，接受批评的能力。",
            "善于处理社会关系的人会承认错误并承担责任，这是处理错误的一种成熟和负责任的态度。他们很注意和同事建立良好的工作关系，所以处处受人欢迎。",
            "而人际交往能力差的人很难接受他人的批评。遇到错误时，他们让自我意识挡道。他们逃避责任，变得情绪化或者愤怒。他们甚至还给自己贴上「多刺」的标签。",
        ],
        ref=[
            "Sometimes, interpersonal relationship is of great importance in your career. Interpersonal skills are the ability to be a good listener, to be sensitive toward others' needs, to take criticism well.",
            "People with good skills in social relations admit their mistakes and take responsibility, which shows the maturity and responsibility in handling errors. Careful in establishing a good working relationship with colleagues, they are well liked everywhere.",
            "People with poor interpersonal skills have trouble taking criticism. When confronted with a mistake, they let their ego get in the way. They avoid responsibility and become moody or angry. They even mark themselves as \u201cprickly\u201d.",
        ],
        seg=[
            ("处理好人际关系……非常重要", "interpersonal relationship is of great importance in your career",
             "「非常重要」写成 be of great importance，比 very important 更像书面语；「处理好」不必译出来，主语直接落到 interpersonal relationship 上。"),
            ("一种善于……的能力", "the ability to be a good listener, to be sensitive toward others' needs, to take criticism well",
             "汉语一个「善于……的能力」拆成三个并列不定式，英语不喜欢长定语前置；「体察需求」= be sensitive toward sb.'s needs。"),
            ("善于处理社会关系的人", "People with good skills in social relations",
             "定语「善于……的」→ with 介词短语后置，这是本单元反复出现的处理方式。"),
            ("这是处理错误的一种成熟和负责任的态度", ", which shows the maturity and responsibility in handling errors",
             "汉语用逗号接一个评论句，英语必须把它变成 which 非限定从句或新句子，直接并列会 run-on。"),
            ("他们很注意和同事建立良好的工作关系，所以处处受人欢迎", "Careful in establishing a good working relationship with colleagues, they are well liked everywhere",
             "「很注意……」译成形容词短语作原因状语（Careful in doing sth.），主句用被动 are well liked —— 这是 Conversion 的典型：副词性状语 + 被动句。"),
            ("遇到错误时，他们让自我意识挡道", "When confronted with a mistake, they let their ego get in the way",
             "When confronted with 是省略形式（= when they are confronted with）；get in the way 固定搭配，比 block 更自然。"),
            ("他们逃避责任，变得情绪化或者愤怒", "They avoid responsibility and become moody or angry",
             "avoid 后接名词或动名词；「情绪化」用 moody，不用 emotional（后者偏「易动感情的」）。"),
            ("给自己贴上「多刺」的标签", "mark themselves as \u201cprickly\u201d",
             "mark sb. as sth.；引号里的词照抄原文，不译成「多刺的」，因为它在这里是被引用的标签。"),
        ],
    ),
    3: dict(
        kw=["solar terms", "be traced back to", "temperature", "indicate",
            "crucial", "accordingly", "recreation", "ancestor"],
        zh=[
            "清明是我国二十四节气之一，一般是在每年的4月5日前后。人们庆祝清明节始于东周时代，距今已有2500多年的历史。",
            "清明过后，气温逐渐上升，雨水也增多，表明了这是农民开始安排农耕活动的关键时期。",
            "同时，清明也是郊游的大好时节，人们去户外踏青，并开展各种消遣和体育活动。更重要的是，清明时节也是一个纪念祖先和已故亲人的日子。",
        ],
        ref=[
            "Qingming is one of the twenty-four solar terms in China, typically falling on April 5 each year. The celebration for the Qingming Festival can be traced back to the Eastern Zhou Dynasty, with a history dating back over 2,500 years.",
            "After Qingming time, the temperature begins to rise and rainfall increases, indicating that it is the crucial time for the farmers to arrange their farming activities accordingly.",
            "Meanwhile, it is the high time for spring outing, when people go out for fresh air with all kinds of recreations and sports activities. More importantly, Qingming is also a period to honour and pay respect to one's deceased ancestors and family members.",
        ],
        seg=[
            ("二十四节气之一", "one of the twenty-four solar terms",
             "「之一」永远是 one of the + 复数名词；solar terms 是本单元必须会拼的表达。"),
            ("一般是在每年 4 月 5 日前后", ", typically falling on April 5 each year",
             "用现在分词短语补充日期，避免再起一句；日期、节日「落在某天」用 fall on。"),
            ("人们庆祝清明节始于东周时代", "The celebration for the Qingming Festival can be traced back to the Eastern Zhou Dynasty",
             "汉语「人们庆祝……始于……」的主语是「人们」，英语换成「庆祝活动」并改被动 be traced back to —— 主语转换，这是本单元 Translation 的核心技巧。"),
            ("距今已有 2500 多年的历史", ", with a history dating back over 2,500 years",
             "with + 宾语 + 现在分词（dating back）作伴随状语，比 which has a history of … 简洁。"),
            ("气温逐渐上升，雨水也增多", "the temperature begins to rise and rainfall increases",
             "「逐渐」不必译成 gradually，begin to rise 本身已经含「开始渐变」；rainfall 不可数，不加 s。"),
            ("表明了这是……的关键时期", ", indicating that it is the crucial time for the farmers to arrange …",
             "用 indicating 分词作结果状语；it is time for sb. to do sth. 句型；accordingly 回指「随气温和雨水变化」。"),
            ("郊游的大好时节", "it is the high time for spring outing",
             "「大好时节」= the high time for；spring outing 是「春游/踏青」的固定说法。"),
            ("人们去户外踏青，并开展各种消遣和体育活动", "when people go out for fresh air with all kinds of recreations and sports activities",
             "when 引导定语从句修饰 the high time；「踏青」意译为 go out for fresh air，不逐字译 tread on grass。"),
            ("纪念祖先和已故亲人", "honour and pay respect to one's deceased ancestors and family members",
             "「纪念」用 honour / pay respect to；「已故的」用 deceased，比 dead 得体。"),
        ],
    ),
    4: dict(
        kw=["take to", "environment", "enchanting", "temperament",
            "mental", "fall into", "stage", "cast aside"],
        zh=[
            "乔羽的歌大家都熟悉。但他有一大爱好却鲜为人知，那就是钓鱼。晚年的乔羽喜欢垂钓，他说：「有水有鱼的地方大都是有好环境的，好环境便会给人好心情。我认为最好的钓鱼场所不是舒适的、给你准备好鱼的垂钓园，而是那极其有吸引力的大自然野外天成的场所。」",
            "钓鱼是一项能够陶冶性情的运动，有益于身心健康。乔羽又说：「钓鱼可分三个阶段：第一阶段是吃鱼；第二阶段是吃鱼和情趣兼而有之；第三阶段主要是钓趣，面对一池碧水，将忧心烦恼全都抛到一边，使自己的身心得到充分休息。」",
        ],
        ref=[
            "Everyone is familiar with Qiao Yu's songs, but his great hobby is little known: fishing. Qiao Yu took to fishing at his old age. He once said: \u201cWhere there is fish and water, there is good environment, and good environment can make one feel good. I think the best place for fishing is not a comfortable man-made fish-pond where hungry fish are ready for you, but an enchanting place in the wild nature.\u201d",
            "Fishing, a game that can help improve one's temperament, is good for mental and physical health. \u201cFishing falls into three stages,\u201d he went on. \u201cThe first stage is just for eating fish. The second stage is for enjoying the pleasure of fishing as well as eating fish. And the third stage is mainly for the pleasure of fishing. Facing a pool of clean water, one casts aside the worries and takes a good rest in fishing for both the mind and the body.\u201d",
        ],
        seg=[
            ("乔羽的歌大家都熟悉", "Everyone is familiar with Qiao Yu's songs",
             "汉语「大家都熟悉 X」英语通常让「大家」当主语、X 作宾语：Everyone is familiar with …；不要写成 Qiao Yu's songs are familiar to everyone，虽然后者也对，但教材选前者。"),
            ("但他有一大爱好却鲜为人知", "but his great hobby is little known",
             "「鲜为人知」= be little known，little 表否定程度（几乎不）；不译成 few people know it。"),
            ("晚年的乔羽喜欢垂钓", "Qiao Yu took to fishing at his old age",
             "take to doing sth. = 开始并喜欢上某活动；「晚年」at his old age。"),
            ("有水有鱼的地方大都是有好环境的", "Where there is fish and water, there is good environment",
             "「……的地方大都……」→ Where there is …, there is …；这种地点状语从句比 in places where 更干净。"),
            ("不是……而是……", "is not a comfortable man-made fish-pond where …, but an enchanting place in the wild nature",
             "not A but B 结构里，A 内部还带一个 where 定语从句（hungry fish are ready for you 解释「垂钓园」的性质）。"),
            ("钓鱼是一项能够陶冶性情的运动", "Fishing, a game that can help improve one's temperament, is good for …",
             "同位语 a game that … 插在主语和谓语之间，把长定语从前面挪到后面，句子的重心才不会被压垮。"),
            ("有益于身心健康", "is good for mental and physical health",
             "「有益于」= be good for / be beneficial to；身心 = mental and physical。"),
            ("钓鱼可分三个阶段", "Fishing falls into three stages",
             "「可分为」用 fall into，表自然分类；不译成 can be divided into（意思对，但教材口径是 fall into）。"),
            ("第二阶段是吃鱼和情趣兼而有之", "The second stage is for enjoying the pleasure of fishing as well as eating fish",
             "as well as 连接并列成分，重心在前的部分；用 for doing 说明这一阶段的目的。"),
            ("面对一池碧水，将忧心烦恼全都抛到一边", "Facing a pool of clean water, one casts aside the worries",
             "Facing 分词作状语；cast aside 是本单元重点短语，注意 cast 的过去式仍是 cast。"),
        ],
    ),
    5: dict(
        kw=["crossword", "absorbing", "captivating", "acquisition",
            "profoundly", "thought-provoking", "fascinate", "destination"],
        zh=[
            "学习汉语就像下国际象棋或者是玩填字游戏，让人不由自主地全心投入、神魂颠倒，反正我是乐在其中——用「乐在其中」来形容可能并不准确，可我想不出什么更好的词了。",
            "学习汉语不仅仅是语言习得的渐进过程，它也让我不停地去思考交流的意义和语言的力量。",
            "汉语学习是极其美妙、极其鼓舞人心、引人深思的挑战。我必须不断前进，因为这段旅程本身和到达目的地同样让我着迷。",
        ],
        ref=[
            "Learning Chinese is like playing chess or doing the crossword. It's totally absorbing, completely captivating, and I enjoy myself. It's not the right word, but how else can I say it? \u2014 I enjoy myself.",
            "It's not just a gradual process of language acquisition. Moreover, it inspires ongoing questions about the meaning of communication and the power of language.",
            "It's a very beautiful, profoundly inspiring and thought-provoking challenge. I have to keep going, as the journey will fascinate me as much as the arrival at my destination.",
        ],
        seg=[
            ("学习汉语就像……", "Learning Chinese is like playing chess or doing the crossword",
             "动名词 Learning Chinese 作主语；like 后面必须接动名词，playing / doing，不能接 to do。"),
            ("让人不由自主地全心投入、神魂颠倒", "It's totally absorbing, completely captivating",
             "汉语「让人……的」是动词短语作定语，英语改成对主语的评价形容词 —— 这是 Conversion 里「动词/动词短语 → 形容词」的典型一例。"),
            ("反正我是乐在其中", "and I enjoy myself",
             "「乐在其中」口语里就是 enjoy oneself；用 and 把两个评价句并起来，不硬塞从句。"),
            ("可我想不出什么更好的词了", "but how else can I say it?",
             "反问句比 I can't think of a better word 更贴近原句的语气，也更像英语母语者的写法。"),
            ("不仅仅是语言习得的渐进过程", "It's not just a gradual process of language acquisition",
             "not just 与下句 Moreover 组成「不只是 A，而且还 B」的递进框架；acquisition 是名词，不能写成 acquiring language 之后再加 process。"),
            ("它也让我不停地去思考交流的意义和语言的力量", "Moreover, it inspires ongoing questions about the meaning of communication and the power of language",
             "「让我思考」名词化为 inspire questions about，比 makes me think about 更书面，也更符合本单元长句的风格。"),
            ("极其美妙、极其鼓舞人心、引人深思的挑战", "a very beautiful, profoundly inspiring and thought-provoking challenge",
             "三个定语并列时副词只修饰最近的一个（profoundly inspiring），别写成 profoundly beautiful；破折号连接的复合形容词要带连字符。"),
            ("我必须不断前进", "I have to keep going",
             "keep going 比 continue to move forward 更自然；表示「不能停」用 have to，不用 must（must 偏主观命令）。"),
            ("这段旅程本身和到达目的地同样让我着迷", "as the journey will fascinate me as much as the arrival at my destination",
             "as … as 平级比较；fascinate 是及物动词，直接跟人，不用 fascinate to me。"),
        ],
    ),
    6: dict(
        kw=["indispensable", "pronunciation", "surplus", "identical",
            "originate from", "thrift", "virtue", "promote"],
        zh=[
            "鱼是春节前夕餐桌上不可或缺的一道菜，因为汉语中「鱼」字的发音与「余」字的发音相同。正由于这个象征性的意义，春节期间鱼也作为礼物送给亲戚朋友。",
            "鱼的象征意义据说源于中国传统文化。中国人有节省的传统，他们认为节省得愈多，就感到愈为安全。",
            "今天，尽管人们愈来愈富裕了，但他们仍然认为节省是一种值得弘扬的美德。",
        ],
        ref=[
            "Fish is indispensable at the dining table on the eve of Spring Festival, since the pronunciation of \u201cfish\u201d and \u201csurplus\u201d are identical to each other in Chinese. With this symbolic meaning, fish is also given as a gift to relatives and friends during the Spring Festival.",
            "It is said that the symbolic meaning of fish originated from traditional Chinese culture. The Chinese people have a tradition of thrift, believing that the more they save, the securer they will feel.",
            "Nowadays, although people are becoming increasingly rich, thrift is still regarded as a virtue worth promoting.",
        ],
        seg=[
            ("鱼是……不可或缺的一道菜", "Fish is indispensable at the dining table on the eve of Spring Festival",
             "「是不可或缺的一道菜」不必逐字译成 is an indispensable dish，直接用形容词作表语 + 地点状语，英语更简洁。"),
            ("因为「鱼」的发音与「余」相同", "since the pronunciation of \u201cfish\u201d and \u201csurplus\u201d are identical to each other",
             "identical to each other 强调「完全相同」；since 引导原因状语，比 because 更书面。"),
            ("正由于这个象征性的意义", "With this symbolic meaning",
             "with 短语替代 because of this symbolic meaning，短、稳，也避免与前面的 since 重复。"),
            ("鱼也作为礼物送给亲戚朋友", "fish is also given as a gift to relatives and friends",
             "汉语无主句 → 英语被动；give sth. as a gift to sb. 是固定搭配顺序。"),
            ("据说源于中国传统文化", "It is said that … originated from traditional Chinese culture",
             "It is said that 句型；originate from 是本单元必背短语，注意 from，不是 in。"),
            ("中国人有节省的传统", "The Chinese people have a tradition of thrift",
             "「节省」名词化为 thrift（不可数），比 saving money 更贴文化话题。"),
            ("他们认为节省得愈多，就感到愈为安全", "believing that the more they save, the securer they will feel",
             "现在分词 believing 作伴随状语；the + 比较级, the + 比较级结构，secure 的比较级 securer。"),
            ("尽管人们愈来愈富裕了", "although people are becoming increasingly rich",
             "进行时表「正在渐变」，increasingly 比 more and more 书面。"),
            ("节省仍被视为一种值得弘扬的美德", "thrift is still regarded as a virtue worth promoting",
             "be regarded as + 名词；be worth doing（worth 后接动名词）。"),
        ],
    ),
}

CHAIN_NOTE = {
    2: ('<p class="meta">本单元的平台任务名已按截图核对：</p>'
        '<ul class="tight">'
        '<li><code>Understanding Relationships (Section A) &gt; Use of Language &gt; 1</code> 与 <code>&gt; 2</code></li>'
        '<li><code>Improving Relationships (Section A) &gt; Use of Language</code></li>'
        '<li><code>Improving Relationships (Section A) &gt; Translation</code></li>'
        '</ul>'
        '<p class="meta">也就是说：Text A 是 <b>Understanding Relationships</b>，本单元的第二篇'
        '（Section A 里的 Reading）是 <b>Improving Relationships</b>，翻译题挂在第二篇下面。</p>'),
}


def chain_rows(u):
    n = u["no"]
    return [
        ("Starter", "Pair Work / Group Work / Optional Task —— 热身与话题激活", "M1"),
        ("Section A · Listening", "听力：抓主旨与关键细节", "—"),
        ("Section A · Text A + Reading Comprehension", "课文精读 + 理解题（判断 / 简答）", "M3"),
        ("Section A · Use of Language 1", "选词填空：词义 + 词形 + 搭配",
         "M6 · 教材原题" if n == 1 else "M6 · 待录入"),
        ("Section A · Use of Language 2", "短语填空 / 句型转换：搭配 + 句法",
         "M6 · 教材原题" if n == 1 else "M6 · 待录入"),
        ("Section A · Reading / Watching / Writing", "拓展阅读、视听与写作任务（本单元技能线）", "M3 / M4 / M5"),
        ("Section B · Watching / Speaking", "语用任务：提出请求、表达态度、给出建议等", "M4"),
        ("主题二 · Text B + Reading Comprehension", "第二篇课文 + 理解题 + 填空式概要", "M3"),
        ("主题二 · Use of Language", "词 / 短语 / 句型练习：语言点巩固", "M6 · 待录入"),
        ("主题二 · Translation", "段落翻译：中译英，给 8–10 个关键词", "M6 · 教材原题"),
        ("主题二 · Writing", "写作知识与练习：结构 + 模板句", "M5"),
        ("Section B · Listening / Watching / Speaking", "听力、视听、口语：语用能力", "M4"),
        ("Project + Further Study", "综合项目与拓展学习：输出型任务", "M6"),
    ]


# ======================================================================
# 2. 从旧页里取 M1–M5 与旧 M6 的碎片
# ======================================================================
def load_units(path):
    """按 details 嵌套配对切开每个单元的正文（M6 里还有 <details class="ans">，
    不能简单地找第一个 </details>）"""
    src = io.open(path, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'<details class="unit" id="(u\d)"', src):
        uid = m.group(1)
        start = src.find(">", m.end()) + 1
        i = start
        depth = 1
        while depth > 0:
            no = src.find("<details", i)
            nc = src.find("</details>", i)
            if nc < 0:
                break
            if 0 <= no < nc:
                depth += 1
                i = no + 8
            else:
                depth -= 1
                i = nc + 10
        out[uid] = src[start:i - len("</details>")]
    return out


def split_modules(body, n):
    body = body[body.find('<div class="ubody">'):]
    body = body.replace('<div class="ubody">', "", 1)
    marks = [(mm.start(), int(mm.group(1)))
             for mm in re.finditer(r'<div class="mod" id="u%d-m(\d)"' % n, body)]
    mods = {}
    for i, (pos, k) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(body)
        chunk = body[pos:end]
        mods[k] = chunk
    # 最后一块去掉 ubody 的收尾
    last = mods[max(mods)]
    if last.rstrip().endswith("</div>"):
        idx = last.rstrip().rfind("</div>")
        last = last.rstrip()[:idx]
    mods[max(mods)] = last
    return mods


def parse_m6(m6):
    """把旧 M6 拆成：词汇练习 / 写作练习 / 例题组（分原题与自编）/ 自测清单"""
    i1 = m6.find('<p class="meta"><b>一、')
    i2 = m6.find('<p class="meta"><b>二、')
    i3 = m6.find('<p class="meta"><b>三、')
    iex = m6.find('<div class="exgrp">')
    igoal = m6.find('<ul class="goal">')

    vocab = m6[i1:i2] if i1 > -1 and i2 > -1 else ""
    writing = m6[i3:iex] if i3 > -1 and iex > -1 else ""
    ex_zone = m6[iex:igoal] if iex > -1 and igoal > -1 else ""
    groups = ['<div class="exgrp">' + c.rstrip() for c in ex_zone.split('<div class="exgrp">')[1:]]
    book = [g for g in groups if 'exk off' in g]
    draft = [g for g in groups if 'exk off' not in g]
    goal = m6[igoal:] if igoal > -1 else ""
    if goal.rstrip().endswith("</div>"):
        idx = goal.rstrip().rfind("</div>")
        goal = goal.rstrip()[:idx]
    return dict(vocab=vocab, writing=writing, book=book, draft=draft, goal=goal)


# ======================================================================
# 3. 生成 M6
# ======================================================================
def esc(s):
    return html.escape(s, quote=False)


def build_m6(u, old):
    n, uid = u["no"], u["uid"]
    t = TRANS[n]

    rows = []
    for name, what, where in chain_rows(u):
        if "教材原题" in where:
            dot = '<span class="dot ok">已录入</span>'
        elif "待录入" in where:
            dot = '<span class="dot todo">待录入</span>'
        else:
            dot = '<span class="mut">—</span>'
        rows.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>"
                    % (esc(name), what, esc(where), dot))

    note = CHAIN_NOTE.get(n, "")
    if not note:
        note = ('<p class="meta">平台任务名除 Unit 2 外均按教材板块结构列出；'
                '你在平台看到的顺序与此一致，任务名细节以平台为准。</p>')

    # ---- 翻译题卡
    zh = "".join("<li>%s</li>" % esc(x) for x in t["zh"])
    kw = "".join("<li>%s</li>" % esc(x) for x in t["kw"])
    ref = "".join("<p>%s</p>" % esc(x) for x in t["ref"])
    seg = "".join("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % (esc(a), esc(b), esc(c))
                  for a, b, c in t["seg"])

    trans_card = """
<div class="task book">
  <div class="task-h"><span class="tno">T</span><h4>Translation · 段落翻译</h4><span class="ttag">教材原题</span><span class="tmeta">主题二（Section A）· 给 8–10 个关键词 · 三段中文</span><button class="chip act" type="button" data-veil>遮住解答</button></div>
  <div class="task-b">
    <p class="ask">题目（中文原文，按教材分段）</p>
    <ol class="zh">%s</ol>
    <p class="ask">教材给出的关键词</p>
    <ul class="kw">%s</ul>
    <div class="ansbox">
      <p class="ask">参考译文</p>
      <div class="en">%s</div>
      <p class="ask">结构对照：中文的哪一句，换成了英语的哪个结构</p>
      <table class="seg"><colgroup><col style="width:26%%"><col style="width:30%%"><col style="width:44%%"></colgroup><thead><tr><th>中文</th><th>译文用的结构</th><th>为什么这么译</th></tr></thead><tbody>%s</tbody></table>
    </div>
  </div>
</div>""" % (zh, kw, ref, seg)

    # ---- Use of Language 区
    if old["book"]:
        uol = ('<div id="%s-m6-uol"></div><p class="meta"><b>Use of Language · 教材原题</b>　'
               '本单元这一屏是平台上的<b>选词填空</b>（10 题，词库在题上方），题面按教材逐题录入。'
               '另外三组——短语填空、句型转换，以及翻译技巧与写作规划的例题精讲——'
               '分别放在 <b>M2 / M3 / M5</b> 里，标题上同样标着「教材原题」。</p>'
               + "".join(old["book"])) % uid
    else:
        uol = """
<div class="task need" id="%s-m6-uol">
  <div class="task-h"><span class="tno">L</span><h4>Use of Language 1 / 2</h4><span class="ttag self">待录入</span><span class="tmeta">需要你提供题面</span></div>
  <div class="task-b">
    <p class="meta">平台上这一项是「选词填空 + 短语/句型」，题面在登录后的页面里，我这边抓不到。需要你补的是这三样：</p>
    <ul class="needlist">
      <li><code>词库</code>——题目上方那排待选词，按原顺序抄下来即可</li>
      <li><code>10–15 个题干</code>——只要句子和空格位置，答案不用截</li>
      <li><code>第二组（短语 / 句型）</code>——如果是改写句子，把原句抄全</li>
    </ul>
    <p class="meta">把截图或文字发我，我按 Unit 1 的粒度补成「题面 + 答案 + 逐题解析」，直接替换这张卡，其余单元的结构不用动。</p>
  </div>
</div>""" % uid

    # ---- 过渡练习
    draft_inner = old["vocab"] + old["writing"] + "".join(old["draft"])
    draft = """
<details class="draft" id="%s-m6-draft">
  <summary><b>过渡练习</b>（自编，教材题面补进来后逐项替换）</summary>
  <div class="draft-body">%s</div>
</details>""" % (uid, draft_inner)

    return """
<div class="mod" id="%s-m6"><h3><span class="mtag">M6</span>课内习题<span class="msub">WE Learn 任务链 · 教材原题 · 逐题解析</span></h3>

<div class="chain">
<p class="meta"><b>一、WE Learn 任务链</b>　平台上的题就是按这张表的顺序排的，做完一项往下走，不会漏。最后一列是「这一项在本页哪里」。</p>
%s
<table class="chaintbl"><colgroup><col style="width:37%%"><col style="width:37%%"><col style="width:15%%"><col style="width:11%%"></colgroup><thead><tr><th>平台任务</th><th>练什么 / 考点</th><th>本站位置</th><th>状态</th></tr></thead><tbody>%s</tbody></table>
</div>

<p class="meta"><b>二、教材原题</b>　题面、关键词与参考答案均按教材录入；解析里的「为什么这么译」是本页补的。</p>
%s
%s

%s

<p class="meta" id="%s-m6-goal"><b>三、单元自测</b>　对照本单元 Learning Objectives 逐条打勾，四条都打上才算过完一遍。</p>
%s
</div>""" % (uid, note, "".join(rows), trans_card, uol, draft, uid, old["goal"])


# ======================================================================
# 4. 页面骨架
# ======================================================================
CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>'
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>'
SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>'
TOPHAT = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>')
THEME_ICO = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'
             '<circle cx="12" cy="12" r="3.6"/></svg>')

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>第 1 册 · 领航大学英语综合教程 1 · 课内习题对齐版</title>
<meta name="description" content="《领航大学英语·综合教程 1》六个单元的课内习题：按 WE Learn 的真实任务链重排，Translation 六组题面与参考译文按教材录入，配逐句结构对照与解析。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%234d8dff'/%3E%3Ctext x='32' y='46' font-family='system-ui,sans-serif' font-size='30' font-weight='700' fill='%23041020' text-anchor='middle'%3EE%3C/text%3E%3C/svg%3E">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
</head>
<body data-book="b1">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark">E</span>
        <span class="brand-txt"><b>大学英语</b><small>领航 · 综合教程</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      @@SEARCH@@
      <input id="sideSearch" type="search" placeholder="搜单元、课文、习题…" autocomplete="off" aria-label="搜索本册">
      <kbd>Ctrl K</kbd>
    </div>
    <nav class="side-nav" id="nav" aria-label="本站目录">
      <div class="nv-mod" data-mod="b1">
        <button class="nv-h" type="button" data-fold="b1"><span class="chev">@@CHEV@@</span><b>第 1 册 · 大一上</b><em>6</em></button>
        <div class="nv-list">@@NAVITEMS@@</div>
      </div>
      <div class="nv-mod fold" data-mod="more">
        <button class="nv-h" type="button" data-fold="more"><span class="chev">@@CHEV@@</span><b>其他册 / 站点</b><em>5</em></button>
        <div class="nv-list">
          <a class="nv-i" href="./index.html"><span class="tt">四册总览</span></a>
          <a class="nv-i" href="./b2.html"><span class="tt">第 2 册 · 大一下</span></a>
          <a class="nv-i" href="./b3.html"><span class="tt">第 3 册 · 大二上</span></a>
          <a class="nv-i" href="./b4.html"><span class="tt">第 4 册 · 大二下</span></a>
          <a class="nv-i" href="../acm/index.html"><span class="tt">编程学习站</span></a>
        </div>
      </div>
    </nav>
    <div class="side-foot">
      <div class="pg-t"><span>本册进度</span><b id="pgNum">0 / 6</b></div>
      <div class="pg-bar"><i id="pgBar"></i></div>
      <div class="side-tools"><a class="mini-btn" href="./index.html">四册总览</a></div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="./index.html">大学英语</a><span class="sep">/</span><span class="cur">第 1 册 · 课内习题</span></div>
      <div class="top-r">
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">@@THEME@@<span class="tl">浅色</span></button>
        <a class="top-btn" href="https://welearn.sflep.com/student/course_info.aspx?cid=3224" target="_blank" rel="noopener"><span class="tl">WE Learn</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">@@TOPHAT@@</button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
            <header class="doc-head">
              <div class="eyebrow">大学英语 · 第 1 册</div>
              <h1>领航大学英语 · 综合教程 1<span class="hno">B1</span></h1>
              <p class="lede">六个单元，每个单元的课内习题都按 WE Learn 的真实任务链重排：先看清平台上题目的顺序，再逐项拿到题面、答案和解析。Translation 六组题面与参考译文已按教材录入，并补了逐句结构对照；Use of Language 目前只有 Unit 1 是教材原题，其余单元在原来的位置上留了「待录入」卡，写明还缺哪几样材料。自编的过渡练习全部收进折叠块，不占视线。</p>
              <div class="chips">
                <span class="chipk"><b>6</b> 个单元</span>
                <span class="chipk"><b>6</b> 组真实翻译题</span>
                <span class="chipk lv"><b>36</b> 题教材原题（U1）</span>
                <span class="chipk">自编练习已折叠</span>
              </div>
            </header>

            <div class="docbody">
              <div class="callout ok">
                <p><b>怎么用这一页</b></p>
                <p>① 先看每单元 M6 开头的「任务链」表，知道这一单元平台上有几项任务、分别落在哪个模块；② 做 Translation 前点一次「遮住解答」，先自己译一遍；③ 对答案时别只看参考译文，重点看下面的「结构对照」——汉译英卡住的地方八成是句子结构没换，不是单词不会。</p>
              </div>
@@UNITS@@
            </div>
          </article>
        </div>
        <aside class="rail" id="rail">
          <div class="rail-in">
            <div class="rail-t">本页目录</div>
            <nav id="tocList"></nav>
          </div>
        </aside>
      </div>
    </div>
  </div>
</div>
<div class="mask"></div>
<script src="./en.js"></script>
</body>
</html>
"""


U2_NOTE = """
<div class="callout">
  <p><b>一处更正</b>　这一单元的两篇课文名原来写成了 People and Relationships / Gratitude，和 WE Learn 上的任务名对不上。按平台显示：Text A 是 <b>Understanding Relationships</b>，Section A 里的第二篇阅读是 <b>Improving Relationships</b>，翻译题挂在第二篇下面（原文讲的是职场里的人际能力、接受批评、ego、prickly）。</p>
  <p>下面 Learning Objectives 里凡是涉及「表达感谢」「写私人信件」的条目，仍是旧话题留下的没清干净，以教材目录为准。</p>
</div>
"""

MOD_NAMES = [(1, "单元导入"), (2, "词汇与语言点"), (3, "课文精读"),
             (4, "听力口语"), (5, "翻译写作"), (6, "课内习题")]


def build_unit(u, mods, old6):
    n, uid = u["no"], u["uid"]
    verdict_cls, verdict_txt = u["verdict"]
    body = mods[1] + mods[2] + mods[3] + mods[4] + mods[5] + build_m6(u, old6)
    tabs = "".join('<a href="#%s-m%d">M%d %s</a>' % (uid, k, k, nm) for k, nm in MOD_NAMES)
    if uid == "u2":
        body = body.replace(
            '<div class="th"><b>主题一</b>People and Relationships —— 关系里的「给」</div>',
            '<div class="th"><b>主题一</b>Understanding Relationships —— 读懂一段关系里到底发生了什么</div>')
        body = body.replace(
            '<div class="th"><b>主题二</b>Gratitude —— 把感谢说出口</div>',
            '<div class="th"><b>主题二</b>Improving Relationships —— 把关系修好：职场里的沟通与批评</div>')
        body = body.replace(
            '<p class="meta"><b>Learning Objectives（教材列出的学习目标）</b></p>',
            U2_NOTE + '<p class="meta"><b>Learning Objectives（教材列出的学习目标）</b></p>')
    return """
<section class="unit" id="%(uid)s" data-unit="%(n)d" data-title="%(en)s">
  <div class="uhead">
    <div class="uno">%(no)s</div>
    <div class="ut">
      <h2 class="u2t">%(en)s<span class="uzh">%(zh)s</span></h2>
      <p class="usub">主题一 %(t1)s　·　主题二 %(t2)s</p>
    </div>
    <div class="ubadges">
      <span class="verdict %(vc)s">%(vt)s</span>
      <button class="btn-done" type="button" data-unit="%(uid)s">标记已学</button>
    </div>
  </div>
  <nav class="mtabs" aria-label="本单元模块">%(tabs)s</nav>
%(body)s
</section>""" % dict(uid=uid, n=n, no="%02d" % n, en=u["en"], zh=u["zh"],
                    t1=u["t1"], t2=u["t2"], vc=verdict_cls, vt=verdict_txt, body=body,
                    tabs=tabs)


def main():
    units_src = load_units(OLD)
    out_units = []
    navitems = []
    for u in UNIT_META:
        n = u["no"]
        mods = split_modules(units_src[u["uid"]], n)
        old6 = parse_m6(mods[6])
        out_units.append(build_unit(u, mods, old6))
        navitems.append('<a class="nv-i" href="#%s" data-unit="%s"><span class="no">%02d</span>'
                        '<span class="tt">%s</span><span class="mk">%s</span></a>'
                        % (u["uid"], u["uid"], n, u["en"], CHECK))

    page = (HEAD.replace("@@SEARCH@@", SEARCH)
                .replace("@@CHEV@@", CHEV)
                .replace("@@THEME@@", THEME_ICO)
                .replace("@@TOPHAT@@", TOPHAT)
                .replace("@@NAVITEMS@@", "".join(navitems))
                .replace("@@UNITS@@", "\n".join(out_units)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("written:", OUT, len(page), "chars")


if __name__ == "__main__":
    main()
