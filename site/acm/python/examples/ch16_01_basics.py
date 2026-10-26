"""ch16_01_basics.py —— try/except/else/finally 的执行顺序"""


def step(name):
    print("  [执行]", name)


print("=== 无异常时：try -> else -> finally ===")
try:
    step("try")
except ValueError:
    step("except")
else:
    step("else：没有异常")
finally:
    step("finally")

print("=== 有异常时：try 中断 -> except -> finally（else 跳过） ===")
try:
    step("try")
    raise ValueError("出事了")
except ValueError as e:
    step(f"except 捕获 {e}")
else:
    step("else：不会执行")
finally:
    step("finally")

print("=== 多个 except：只匹配第一个能接住的 ===")
for exc in (ValueError("值错"), KeyError("缺键"), TypeError("类型错")):
    try:
        raise exc
    except (ValueError, KeyError) as e:
        print(f"  {type(e).__name__} 被元组分支接住：{e}")
    except TypeError as e:
        print(f"  {type(e).__name__} 被单独分支接住：{e}")

print("=== 顺序很重要：宽的先写会吞掉窄的 ===")
try:
    raise KeyError("具体错误")
except Exception as e:
    print("  宽泛分支先接住：", type(e).__name__)

print("=== 未被捕获的异常会继续往上抛 ===")


def inner():
    raise RuntimeError("内层炸了")


def outer():
    try:
        inner()
    except ValueError:
        print("  接不住 RuntimeError")
    finally:
        print("  finally 仍然执行")


try:
    outer()
except RuntimeError as e:
    print("  最外层接住：", e)

print("=== except 里的 as 变量在块结束后被删除 ===")
try:
    raise ValueError("测试")
except ValueError as err:
    print("  块内可用：", err)
try:
    print(err)
except NameError as e:
    print("  块外：NameError:", e)

print("=== 再 raise 同一个异常对象：traceback 会叠加 ===")


def reraise_twice():
    try:
        try:
            1 / 0
        except ZeroDivisionError as e:
            raise e
    except ZeroDivisionError as e2:
        return f"{type(e2).__name__}: {e2}"


print(reraise_twice())