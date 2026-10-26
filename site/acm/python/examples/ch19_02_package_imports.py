"""ch19_02_package_imports.py —— 包结构、__init__ 的职责与 __all__"""

import sys

import pkgdemo
from pkgdemo import utils
from pkgdemo.shapes import Square

print("包版本：", pkgdemo.VERSION)
print("__init__ 预先导入了子模块：", "shapes" in dir(pkgdemo))
print("导入 utils 后它也成了包的属性：", "utils" in dir(pkgdemo))
print("相对导入解析出的仍是同一个模块：", utils.Circle is pkgdemo.shapes.Circle)

print("=== __all__ 决定 from pkg import * 拿什么 ===")
ns = {}
exec("from pkgdemo import *", ns)
print("星号导入得到的名字：", sorted(k for k in ns if not k.startswith("__")))
print("没写进 __all__ 的 VERSION 不在里面：", "VERSION" in ns)

print("=== 主程序的 __name__ 是 __main__ ===")
print("本脚本 __name__：", __name__)
print("sys.modules['__main__'] 就是本脚本：", sys.modules["__main__"].__name__ == "__main__")
print("被导入的包不会显示为 __main__：", pkgdemo.__name__)

print("=== 子模块的公开接口 ===")
print("Square(3).area()：", Square(3).area())
print("utils 只暴露一个函数：", [n for n in dir(utils) if not n.startswith("_")])