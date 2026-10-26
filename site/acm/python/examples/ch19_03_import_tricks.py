"""ch19_03_import_tricks.py —— python -m、相对导入失败与循环导入"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")


def run(args):
    r = subprocess.run([sys.executable] + args, cwd=HERE, capture_output=True,
                       text=True, encoding="utf-8", env=ENV)
    return r.returncode, r.stdout, r.stderr


print("=== python -m pkgdemo：把包当程序跑 ===")
code, out, err = run(["-m", "pkgdemo"])
print("退出码：", code)
print(out.rstrip())

print("=== 直接运行包内模块：相对导入必然失败 ===")
code, out, err = run([str(HERE / "pkgdemo" / "utils.py")])
print("退出码：", code)
print([n for n in err.splitlines() if n.startswith("ImportError")][-1])

print("=== 循环导入：报错发生在「拿不到名字」的那一刻 ===")
tmp = tempfile.mkdtemp()
p = Path(tmp)
(p / "a_cyc.py").write_text("import b_cyc\nX = 1\n", encoding="utf-8")
(p / "b_cyc.py").write_text("from a_cyc import X\n", encoding="utf-8")
sys.path.insert(0, tmp)
try:
    import a_cyc
except ImportError as e:
    print(type(e).__name__ + ":", str(e).rsplit(" (", 1)[0])
finally:
    sys.path.remove(tmp)
    shutil.rmtree(tmp)
    sys.modules.pop("a_cyc", None)
    sys.modules.pop("b_cyc", None)

print("=== 清理后 sys.modules 里没有残留 ===")
print("a_cyc" in sys.modules, "b_cyc" in sys.modules)