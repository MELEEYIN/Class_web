"""ch01_03_import_it.py —— 导入别人的模块：__name__ 变了，还有 .pyc"""
import importlib.util
from pathlib import Path

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location("run_modes_demo", here / "ch01_02_main_guard.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)          # 导入时 main() 不会自动执行

print("导入后，对方的 __name__ =", mod.__name__)
mod.main()                            # 想跑就显式调用

pyc = sorted(p.name for p in (here / "__pycache__").glob("ch01_02*"))
print("导入产生了字节码缓存：", pyc)