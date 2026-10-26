"""ch11_03_latebinding.py —— 晚绑定：循环里建 lambda 的经典坑"""
fns = [lambda: i for i in range(3)]
print("全都取最后一个 i：", [f() for f in fns])

fns2 = [lambda i=i: i for i in range(3)]
print("用默认参数立即绑定：", [f() for f in fns2])

fns3 = []
for i in range(3):
    fns3.append((lambda n: (lambda: n))(i))
print("套一层函数固定值：", [f() for f in fns3])

print("=== 名字在调用时才查找 ===")
x = 1
g = lambda: x
x = 2
print("定义后改变量，结果跟着变：", g())

print("=== 计数器：lambda 做不了累加，需要 nonlocal ===")


def make_counter():
    count = 0

    def inc():
        nonlocal count
        count += 1
        return count

    return inc


c = make_counter()
print(c(), c(), c())

print("=== 分派表：lambda 放进字典 ===")
ops = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
}
for op, a, b in [("+", 3, 4), ("-", 3, 4), ("*", 3, 4)]:
    print(f"{a} {op} {b} = {ops[op](a, b)}")