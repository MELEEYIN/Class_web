"""ch12_03_stateful.py —— 用闭包做有状态工具：缓存、配置、限次"""
import functools


def memoize(fn):
    cache = {}

    @functools.wraps(fn)
    def wrapper(*args):
        if args not in cache:
            cache[args] = fn(*args)
        return cache[args]

    wrapper.cache = cache
    return wrapper


@memoize
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print("fib(30) =", fib(30))
print("手写缓存里的键数：", len(fib.cache))


@functools.cache
def fib2(n):
    return n if n < 2 else fib2(n - 1) + fib2(n - 2)


print("functools.cache 版本：", fib2(30), "| 条目数：", fib2.cache_info().currsize)

print("=== 带配置的工厂：闭包记住参数 ===")


def make_formatter(prefix, *, upper=False):
    def fmt(msg):
        text = f"{prefix}: {msg}"
        return text.upper() if upper else text

    return fmt


info = make_formatter("[INFO]")
warn = make_formatter("[WARN]", upper=True)
print(info("启动完成"))
print(warn("磁盘快满"))

print("=== 限次调用：状态藏在 cell 里 ===")


def limit_calls(n):
    calls = 0

    def guard(fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            nonlocal calls
            if calls >= n:
                return "已达上限"
            calls += 1
            return fn(*a, **kw)

        return wrapper

    return guard


@limit_calls(2)
def ping():
    return "pong"


print(ping(), ping(), ping())