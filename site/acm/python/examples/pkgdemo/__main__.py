"""python -m pkgdemo 时执行这个文件，而不是 __init__.py。

能被 -m 执行的包，必须在包里放 __main__.py。
"""

from .shapes import Circle

if __name__ == "__main__":
    print("[__main__] 通过 python -m pkgdemo 运行")
    print("包的 __name__ 是 pkgdemo，而本文件是：", __name__)
    print("r=1 的圆面积：", round(Circle(1).area(), 4))