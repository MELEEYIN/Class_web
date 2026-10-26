import importlib.metadata as md
import platform
import sys
import sysconfig

print("解释器版本:", platform.python_version())
print("实现:", platform.python_implementation())
print("在虚拟环境中:", sys.prefix != sys.base_prefix)
print("site-packages 路径已配置:", bool(sysconfig.get_paths()["purelib"]))

for name in ("pip", "setuptools", "wheel"):
    try:
        print(f"{name:<12} {md.version(name)}")
    except md.PackageNotFoundError:
        print(f"{name:<12} 未安装")

dists = list(md.distributions())
print("已安装发行包数量 > 10:", len(dists) > 10)
print("标准库模块名已知 > 100:", len(sys.stdlib_module_names) > 100)

mods = [m for m in ("json", "re", "sqlite3", "tkinter", "ssl") if m in sys.stdlib_module_names]
print("标准库覆盖含:", ",".join(mods))

try:
    import tomllib
    print("tomllib 可用（3.11+ 内置 TOML 解析）:", tomllib is not None)
except ImportError:
    print("tomllib 不可用，需要 pip install tomli")