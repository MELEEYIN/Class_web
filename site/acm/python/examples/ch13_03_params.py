"""ch13_03_params.py —— 带参数的装饰器（三层函数）、类装饰器、重试"""
import functools


def repeat(times):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return [fn(*args, **kwargs) for _ in range(times)]

        return wrapper

    return decorator


@repeat(3)
def say(msg):
    return msg


print(say("hi"))


@repeat(1)
def once(x):
    return x


print(once(7))


def retry(times, exceptions=(ValueError,)):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return f"{fn(*args, **kwargs)}（第 {attempt} 次成功）"
                except exceptions as e:
                    if attempt == times:
                        return f"全部失败：{type(e).__name__}"

        return wrapper

    return decorator


calls = {"n": 0}


@retry(3)
def flaky():
    calls["n"] += 1
    if calls["n"] < 3:
        raise ValueError("还没准备好")
    return "OK"


print(flaky())
print("flaky 实际被调用", calls["n"], "次")

calls2 = {"n": 0}


@retry(2)
def always_bad():
    calls2["n"] += 1
    raise ValueError("永远失败")


print(always_bad())
print("always_bad 实际被调用", calls2["n"], "次")

print("=== 类装饰器：实现 __call__ 的实例可以当装饰器 ===")


class Tag:
    def __init__(self, name):
        self.name = name

    def __call__(self, fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return f"<{self.name}>{fn(*args, **kwargs)}</{self.name}>"

        return wrapper


@Tag("b")
def bold(text):
    return text


print(bold("粗体"))
print("名字仍是：", bold.__name__)

print("=== 装饰器叠加：计时 + 日志 ===")
log = []


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        log.append(fn.__name__)
        return fn(*args, **kwargs)

    return wrapper


def doubled(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs) * 2

    return wrapper


@logged
@doubled
def base(n):
    return n + 1


print(base(3))
print("日志：", log)