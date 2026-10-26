/* ==========================================================================
   learn-nav.js — 「编程学习」站的导航数据源（唯一事实来源 / single source of truth）
   --------------------------------------------------------------------------
   谁读它：
     · site/js/learn-shell.js  —— 渲染侧栏、面包屑、上一课/下一课、页内目录、进度
     · site/acm/index.html     —— 编程学习站首页（两大分类卡片）
     · site/acm/python/index.html —— Python 区入口页（章节网格）

   为什么用 JS 字面量而不是 JSON + fetch：
     本站要能直接用双击 file:// 打开也能跑（没有构建步骤、没有服务器），
     fetch('x.json') 在 file:// 下会被 CORS 拦掉。写成全局变量最稳。

   路径约定（非常重要）：
     href 一律相对 /acm/ 目录书写，**不要**写 ./ 或 ../ 前缀、也不要写 /acm/。
       'study.html'            → /acm/study.html
       'python/01-hello.html'  → /acm/python/01-hello.html
     由 learn-shell.js 按当前页深度补前缀（/acm/*.html → ''，/acm/python/* → '../'）。

   ---- 章节契约（给写正文的人看）----
     文件名、id、标题、顺序全部以本文件为准；正文页从
     site/acm/python/_template.html 复制，只填 <main data-learn-content> 里的内容。
     章节标题改了要同步改这里，否则侧栏 / 上下篇 / 进度会与正文不一致。
   ========================================================================== */
window.LEARN_NAV = {
  v: 1,
  updated: '2026-02',
  site: '编程学习',
  /* 站点总入口（home 不进上下篇序列，也不计入章节数） */
  home: { id: 'home', title: '编程学习首页', href: 'index.html' },

  cats: [
    /* ------------------------------------------------------------------ C++ */
    {
      id: 'cpp',
      name: 'C++ 算法竞赛',
      short: 'C++',
      tint: 'blue',
      note: '算法竞赛主线：C++ 语法与算法模板打底，再拿洛谷真题练手。',
      href: 'study.html',
      groups: [
        {
          id: 'cpp-core',
          name: '核心页面',
          note: '两页装下全部 C++ 内容',
          items: [
            {
              id: 'cpp-study',
              title: '学习资料',
              href: 'study.html',
              tag: '三块合一',
              desc: '学习手册（按算法查）+ 学习计划（按时间学）+ 日常开发（按问题查），已经合成同一页，左侧目录分三组。'
            },
            {
              id: 'cpp-practice',
              title: '题练场',
              href: 'practice.html',
              tag: '123 道真题',
              desc: '洛谷真题按 80 个算法组编排，多组测试合并成一次判定；每题另给 C++ / C / Python 三份参考题解。'
            }
          ]
        }
      ]
    },

    /* --------------------------------------------------------------- Python */
    {
      id: 'python',
      name: 'Python',
      short: 'Python',
      tint: 'amber',
      note: '从零开始的语法主线：每章一个小目标、一段能跑起来的代码，学完能自己写小工具。',
      href: 'python/index.html',
      groups: [
        {
          id: 'py-syntax',
          name: 'Python 语法教程',
          href: 'python/index.html',
          note: '共 26 章 · 按写作顺序陆续上线',
          items: [
            /* @chapters:begin —— 下面这段由 site/acm/python/_render.py 自动生成，别手改；
               章节标题 / 简介 / 顺序 / 锚点全部来自 site/acm/python/NN-english-slug.md 的正文。 */
            { id: 'py-00', no: 0, title: '导读：这套 Python 教程怎么用', href: 'python/00-guide.html',
              desc: '这不是一份"语法罗列"，而是一条从「能读懂别人的代码」到「能写出不踩坑的工程代码」的路线。' },
            { id: 'py-01', no: 1, title: '环境与解释器', href: 'python/01-environment-and-interpreter.html',
              desc: 'Python 程序先被编译成字节码（.pyc），再由虚拟机循环执行——它不是"边读边执行"的脚本，也不是…' },
            { id: 'py-02', no: 2, title: '缩进与基础语法', href: 'python/02-indentation-and-syntax.html',
              desc: 'Python 用缩进代替花括号来表达"哪些语句属于同一个块"。' },
            { id: 'py-03', no: 3, title: '变量与数据类型', href: 'python/03-variables-and-types.html',
              desc: 'Python 的变量不是装数据的盒子，而是贴在对象上的名字。' },
            { id: 'py-04', no: 4, title: '运算符', href: 'python/04-operators.html',
              desc: 'Python 的运算符大多"长得像 C++、语义不一样"。' },
            { id: 'py-05', no: 5, title: '字符串', href: 'python/05-strings.html',
              desc: 'Python 的 str 是不可变的 Unicode 码点序列——不是 char[]，不是字节数组。' },
            { id: 'py-06', no: 6, title: '列表、元组、字典、集合', href: 'python/06-containers.html',
              desc: 'Python 只有四种内置容器，但它们的查找复杂度与可变性完全不同。' },
            { id: 'py-07', no: 7, title: '切片', href: 'python/07-slicing.html',
              desc: '切片 x[a:b:c] 描述的是一段半开区间 [a, b) 上"按下标序列取元素"的规则。' },
            { id: 'py-08', no: 8, title: '流程控制', href: 'python/08-control-flow.html',
              desc: 'Python 的 if 判断的是真值（任何对象都能转 bool），for 遍历的是可迭代对象（不是计数器…' },
            { id: 'py-09', no: 9, title: '推导式', href: 'python/09-comprehensions.html',
              desc: '推导式是"循环 + 追加"这段样板代码的语法压缩。' },
            { id: 'py-10', no: 10, title: '函数与参数', href: 'python/10-functions.html',
              desc: 'Python 的函数调用是"按名字绑定实参"，不是按位置对齐内存。' },
            { id: 'py-11', no: 11, title: 'lambda', href: 'python/11-lambda.html',
              desc: 'lambda 只是"匿名的一行 def"，函数体必须是一个表达式（不能有 return、赋值、多语句）。' },
            { id: 'py-12', no: 12, title: '闭包', href: 'python/12-closures.html',
              desc: '闭包就是"函数 + 它引用的外层变量"。' },
            { id: 'py-13', no: 13, title: '装饰器', href: 'python/13-decorators.html',
              desc: '装饰器就是"接收函数、返回函数的可调用对象"，@deco 只是 f = deco(f) 的语法糖，发生在…' },
            { id: 'py-14', no: 14, title: '作用域与 LEGB', href: 'python/14-scope-legb.html',
              desc: 'Python 的变量作用域是编译期就定好的静态划分，只有四层：Local（函数内）、Enclosing（…' },
            { id: 'py-15', no: 15, title: '迭代器与生成器', href: 'python/15-iterators-generators.html',
              desc: 'for 循环只做三件事——iter(obj) 拿到迭代器、反复 next()、捕获 StopIterat…' },
            { id: 'py-16', no: 16, title: '异常处理', href: 'python/16-exceptions.html',
              desc: '异常是 Python 唯一的错误传递机制——没有错误码、没有 errno 返回值。' },
            { id: 'py-17', no: 17, title: '文件 IO 与 pathlib', href: 'python/17-file-io-pathlib.html',
              desc: 'open() 打开的是一带缓冲的字节流，encoding 决定字节与字符串怎么互转。' },
            { id: 'py-18', no: 18, title: '面向对象', href: 'python/18-oop.html',
              desc: '类是一张「有哪些属性、怎么算」的图纸，实例是一个带自己小字典的对象；obj.attr 不是一条内存偏移…' },
            { id: 'py-19', no: 19, title: '模块与包：导入机制', href: 'python/19-modules-and-packages.html',
              desc: 'import 不是「把文件内容抄进来」，而是一次在 sys.modules 字典里查表、必要时执行模块体…' },
            { id: 'py-20', no: 20, title: '类型注解与 typing', href: 'python/20-type-hints.html',
              desc: '注解是挂在函数和类上的元数据，解释器把它存进 __annotations__ 就完事——不检查、不转换…' },
            { id: 'py-21', no: 21, title: '常用标准库', href: 'python/21-stdlib.html',
              desc: '标准库是「装机自带的一套小工具」——json、re、datetime、collections 这些模块解…' },
            { id: 'py-22', no: 22, title: '并发：threading / multiprocessing / asyncio', href: 'python/22-concurrency.html',
              desc: 'Python 有三种并发手段，区别只在「谁在等」——线程让出 GIL 去等 IO，进程绕开 GIL 去占…' },
            { id: 'py-23', no: 23, title: '虚拟环境与 pip 依赖管理', href: 'python/23-venv-and-pip.html',
              desc: '虚拟环境就是一个独立的 site-packages 目录加上一份指向它的解释器副本；pip 只是往那个目…' },
            { id: 'py-24', no: 24, title: '测试：unittest 与 pytest', href: 'python/24-testing.html',
              desc: '测试是把「我以为它会这样」写成可执行的断言，让机器每次改完代码都替你重跑一遍。' },
            { id: 'py-25', no: 25, title: '调试与性能剖析', href: 'python/25-debugging-and-profiling.html',
              desc: '调试是缩小「我以为」和「实际」的差距，性能是找到那 5% 真正花时间的代码。' },
            { id: 'py-26', no: 26, title: '新手常见坑', href: 'python/26-common-pitfalls.html',
              desc: 'Python 的坑几乎都来自三个设计决定——名字绑定对象（不是持有值）、默认参数只求值一次、一切在运行时…' },
            /* @chapters:end */
          ]
        }
      ]
    }
  ]
};