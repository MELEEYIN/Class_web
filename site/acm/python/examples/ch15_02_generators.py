"""ch15_02_generators.py —— yield 把函数变成状态机"""


def counter(n):
    print("  [生成器启动]")
    i = 0
    while i < n:
        yield i
        i += 1
    print("  [生成器走到结尾]")


c = counter(3)
print("调用生成器函数后拿到：", type(c).__name__)
print("此时函数体执行了吗？看下面有没有打印")
print("next 一次：", next(c))
print("next 两次：", next(c))
for v in c:
    print("for 接着拿到：", v)
try:
    next(c)
except StopIteration:
    print("耗尽后再 next：StopIteration")

print("=== 惰性：只处理被取走的那部分 ===")


def read_rows(rows):
    for r in rows:
        print("  真正读取：", r)
        yield r


rows = ["第1行", "第2行", "第3行"]
pipeline = (r for r in read_rows(rows) if r != "第2行")
print("只取一个：", next(pipeline))
print("再取一个：", next(pipeline))

print("=== send：把值送回生成器内部 ===")


def accumulator():
    total = 0
    while True:
        x = yield total
        if x is None:
            return total
        total += x


acc = accumulator()
print("预激得到初始值：", next(acc))
print("send(10)：", acc.send(10))
print("send(5)：", acc.send(5))
try:
    acc.send(None)
except StopIteration as e:
    print("结束时的 return 值放在 StopIteration.value：", e.value)

print("=== yield from：把子生成器整段委托出去 ===")


def inner():
    yield 1
    yield 2
    return "inner 的返回值"


def outer():
    result = yield from inner()
    print("  外层拿到了子生成器的 return：", result)
    yield 3


print(list(outer()))

print("=== 生成器表达式 vs 列表推导式 ===")
squares_list = [x * x for x in range(4)]
squares_gen = (x * x for x in range(4))
print("列表：", squares_list, "| 类型：", type(squares_list).__name__)
print("生成器求和：", sum(squares_gen), "| 类型：", type(squares_gen).__name__)

print("=== 无限生成器 + 手写 take ===")


def naturals():
    n = 0
    while True:
        yield n
        n += 1


def take(it, k):
    out = []
    for _, v in zip(range(k), it):
        out.append(v)
    return out


print(take(naturals(), 5))
print(take((x * x for x in naturals()), 5))