"""ch19_01_module_basics.py —— 模块是对象、导入缓存与名字绑定"""

import importlib
import sys
from pathlib import Path

import pkgdemo
from pkgdemo.shapes import Circle

print("sys.path[0] 的目录名：", Path(sys.path[0]).name)
print("本脚本的 __name__：", __name__)
print("被导入模块的 __name__：", pkgdemo.__name__)
print("包暴露的名字 __all__：", pkgdemo.__all__)
print("包的 __path__ 是普通列表：", isinstance(pkgdemo.__path__, list),
      "| 目录名：", [Path(p).name for p in pkgdemo.__path__])

print("=== 同一个模块只执行一次 ===")
print("sys.modules 里缓存的就是它：", sys.modules["pkgdemo"] is pkgdemo)
import pkgdemo as again

print("再 import 一次拿到同一个对象：", again is pkgdemo)
print("子模块会变成包的属性：", pkgdemo.shapes.__name__)

print("=== reload 重新执行模块体，但对象不变 ===")
importlib.reload(pkgdemo)
print("reload 之后还是同一个对象：", sys.modules["pkgdemo"] is pkgdemo)

print("=== 四种导入写法指向同一个类 ===")
import pkgdemo.shapes as sh
from pkgdemo.utils import area_table

print("直接导入的类就是子模块里的类：", Circle is sh.Circle)
print("包属性访问也是同一个：", pkgdemo.shapes.Circle is Circle)
print("工具函数结果：", area_table())
print("shapes 的公开名字：", [n for n in dir(sh) if not n.startswith("_")])