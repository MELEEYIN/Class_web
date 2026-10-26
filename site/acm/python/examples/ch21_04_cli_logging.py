import argparse
import contextlib
import io
import logging
import subprocess
import sys


def build_parser():
    p = argparse.ArgumentParser(prog="tool", description="生成报告")
    p.add_argument("path", help="输入文件")
    p.add_argument("-n", "--count", type=int, default=3, help="条数")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


args = build_parser().parse_args(["data.txt", "-n", "5", "-v"])
print(args)
print(args.path, args.count, args.verbose)

err = io.StringIO()
try:
    with contextlib.redirect_stderr(err):
        build_parser().parse_args([])
except SystemExit as e:
    print("code", e.code, "| 说是必填:", "required" in err.getvalue())

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(levelname)s %(name)s %(message)s", force=True)
log = logging.getLogger("demo")
log.debug("debug 低于 INFO，不会出现")
log.info("开始处理 %s", "任务")
log.warning("磁盘已用 %d%%", 90)
log.setLevel(logging.ERROR)
print("logger 级别改为 ERROR 后:", log.isEnabledFor(logging.INFO))

r = subprocess.run([sys.executable, "-c", "print('child ok')"],
                   capture_output=True, text=True)
print(r.returncode, repr(r.stdout))

bad = subprocess.run([sys.executable, "-c", "raise SystemExit(3)"],
                     capture_output=True, text=True)
print(bad.returncode, repr(bad.stdout))

try:
    subprocess.run([sys.executable, "-c", "import sys; sys.exit(1)"],
                   check=True, capture_output=True)
except subprocess.CalledProcessError as e:
    print(type(e).__name__, "returncode =", e.returncode)

try:
    subprocess.run([sys.executable, "-c", "import time; time.sleep(2)"],
                   timeout=0.5, capture_output=True)
except subprocess.TimeoutExpired as e:
    print(type(e).__name__, "timeout =", e.timeout)