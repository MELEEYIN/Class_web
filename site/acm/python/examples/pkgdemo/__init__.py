"""pkgdemo —— 一个演示用的最小包。

包体（__init__.py）在第一次 import 时执行且只执行一次。
"""

from .shapes import Circle, Square
from .utils import area_table

VERSION = "1.0"
__all__ = ["Circle", "Square", "area_table"]

print(f"[pkgdemo] 包体执行了，__name__={__name__}")