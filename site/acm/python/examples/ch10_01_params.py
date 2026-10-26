"""ch10_01_params.py —— 位置参数、关键字参数、默认值与调用检查"""


def greet(name, greeting="你好", punct="!"):
    return f"{greeting}，{name}{punct}"


print(greet("小明"))
print(greet("小明", "早上好"))
print(greet("小明", punct="?"))
print(greet(greeting="嗨", name="小红"))

print("=== 位置参数必须在关键字参数之前 ===")
print(greet("小明", punct="。", greeting="晚安"))
try:
    eval('greet(name="小明", "早")')
except SyntaxError as e:
    print("SyntaxError:", e.msg)

print("=== 调用时的参数校验 ===")
try:
    greet()
except TypeError as e:
    print("TypeError:", e)
try:
    greet("a", "b", "c", "d")
except TypeError as e:
    print("TypeError:", e)
try:
    greet("a", nick="x")
except TypeError as e:
    print("TypeError:", e)

print("=== 默认值只在定义时求值一次：可变默认值陷阱 ===")


def bad(item, bucket=[]):
    bucket.append(item)
    return bucket


print(bad(1), bad(2), bad(3))
print("三次调用共用同一个列表：", bad.__defaults__)


def good(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


print(good(1), good(2))

print("=== 返回值 ===")


def no_return():
    pass


print("没有 return 就返回：", repr(no_return()))


def divmod_like(a, b):
    return a // b, a % b


print("多返回值其实是元组：", divmod_like(7, 2))
q, r = divmod_like(7, 2)
print("解包拿到：", q, r)