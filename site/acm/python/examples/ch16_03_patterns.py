"""ch16_03_patterns.py —— EAFP、with 吞异常、finally 的边界"""
import sys

print("=== LBYL 与 EAFP ===")
data = {"a": 1}
if "b" in data:
    print("LBYL 拿到：", data["b"])
else:
    print("LBYL：键不存在")

try:
    print("EAFP 拿到：", data["b"])
except KeyError as e:
    print("EAFP：KeyError", e)

print("get 的默认值更省事：", data.get("b", 0))

print("=== with 的 __exit__ 返回 True 会吞掉异常 ===")


class Swallow:
    def __enter__(self):
        print("  进入")
        return self

    def __exit__(self, exc_type, exc, tb):
        print("  退出，异常类型：", exc_type.__name__ if exc_type else None)
        return True


try:
    with Swallow():
        raise ValueError("本来会被吞掉")
    print("  with 之后的语句照常执行")
except ValueError:
    print("  不该走到这里")

print("=== __exit__ 返回 False/None，异常继续传播 ===")


class PassThrough:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        print("  清理资源，然后放行")
        return False


try:
    with PassThrough():
        raise ValueError("继续往上抛")
except ValueError as e:
    print("  外层捕获：", e)

print("=== finally 里 return 会压掉异常与返回值 ===")


def swallow_by_return():
    try:
        raise ValueError("原始异常")
    finally:
        return "finally 的返回值"


print("结果：", swallow_by_return())


def keep_value():
    try:
        return "try 的返回值"
    finally:
        print("  finally 仍然执行")


print("结果：", keep_value())

print("=== 循环里的 try/finally：continue 也会走 finally ===")
for i in range(3):
    try:
        if i == 1:
            continue
        print("  处理", i)
    finally:
        print("  finally 拿到 i =", i)

print("=== 裸 raise 重新抛出当前异常 ===")


def check(n):
    try:
        if n < 0:
            raise ValueError("不能为负")
    except ValueError:
        print("  记录日志后继续抛")
        raise


try:
    check(-1)
except ValueError as e:
    print("  外层收到：", e)

print("=== sys.exc_info() 取当前异常三元组 ===")
try:
    1 / 0
except ZeroDivisionError:
    exc_type, exc_val, exc_tb = sys.exc_info()
    print("类型：", exc_type.__name__)
    print("值：", exc_val)
    print("有 traceback 对象：", exc_tb is not None)

print("=== 别捕获 BaseException ===")
print("BaseException 的子类：", [c.__name__ for c in BaseException.__subclasses__()][:4])
print("Exception 是它的子类：", issubclass(Exception, BaseException))