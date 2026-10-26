"""ch13_01_basic.py —— 装饰器到底做了什么"""


def trace(fn):
    def wrapper(*args, **kwargs):
        print(f"  -> 调用 {fn.__name__}{args}")
        result = fn(*args, **kwargs)
        print(f"  <- 返回 {result!r}")
        return result

    return wrapper


def add(a, b):
    return a + b


added = trace(add)
print("手动包装的结果：", added(1, 2))


@trace
def mul(a, b):
    return a * b


print("语法糖包装的结果：", mul(3, 4))
print("mul 现在指向的是：", mul.__name__)

print("=== 装饰器在定义时执行一次，包装函数在调用时执行 ===")


def loud(fn):
    print("  装饰器主体运行，装饰了", fn.__name__)

    def wrapper():
        return fn().upper()

    return wrapper


print("准备定义 hello")


@loud
def hello():
    return "hello"


print("hello 定义完成")
print("第一次调用：", hello())
print("第二次调用：", hello())

print("=== 多个装饰器：由下向上包装，由上向下执行 ===")


def deco_a(fn):
    def wrapper():
        return "A(" + fn() + ")"

    return wrapper


def deco_b(fn):
    def wrapper():
        return "B(" + fn() + ")"

    return wrapper


@deco_a
@deco_b
def inner():
    return "x"


print(inner())

print("=== 忘了 return 就会丢掉返回值 ===")


def careless(fn):
    def wrapper(*args, **kwargs):
        fn(*args, **kwargs)

    return wrapper


@careless
def get_answer():
    return 42


print("careless 包装后：", get_answer())