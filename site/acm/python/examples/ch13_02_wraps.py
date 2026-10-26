"""ch13_02_wraps.py —— functools.wraps：保住被装饰函数的元数据"""
import functools


def no_wraps(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


def with_wraps(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


@no_wraps
def alpha():
    """alpha 的说明文档"""
    return 1


@with_wraps
def beta():
    """beta 的说明文档"""
    return 2


print("不加 wraps：name =", alpha.__name__, "| doc =", alpha.__doc__)
print("加了 wraps：name =", beta.__name__, "| doc =", beta.__doc__)
print("wraps 还补了 __wrapped__：", hasattr(beta, "__wrapped__"), beta.__wrapped__.__name__)

print("=== 用函数属性计数：wraps 之后属性名不会串 ===")


def counted(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)

    wrapper.calls = 0
    return wrapper


@counted
def ping():
    return "pong"


ping()
ping()
ping()
print(ping.__name__, "被调用", ping.calls, "次")

print("=== 标准库现成的装饰器：lru_cache ===")


@functools.lru_cache(maxsize=None)
def slow_square(n):
    print("  真正计算", n)
    return n * n


print(slow_square(4))
print(slow_square(4))
print(slow_square(5))
print(slow_square.cache_info())

print("=== 类方法/静态方法本质上也是装饰器 ===")


class Demo:
    def method(self):
        return "普通方法"

    @staticmethod
    def static():
        return "静态方法不需要 self"

    @property
    def value(self):
        return 100


d = Demo()
print(d.method(), "|", Demo.static(), "|", d.value)
print("staticmethod 是装饰器函数：", type(Demo.__dict__["static"]).__name__)