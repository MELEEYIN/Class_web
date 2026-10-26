"""ch12_01_closure.py —— 闭包的三要素与 __closure__ 实证"""


def make_multiplier(n):
    def mul(x):
        return x * n
    return mul


double = make_multiplier(2)
triple = make_multiplier(3)
print(double(5), triple(5))
print("不同的函数对象：", double is triple, "| 名字都是：", double.__name__)

print("=== 自由变量存在 __closure__ 里 ===")
print("外层函数的自由变量：", make_multiplier.__code__.co_freevars)
print("mul 的自由变量：", double.__code__.co_freevars)
cells = double.__closure__
print("cell 个数：", len(cells))
print("cell 里存的值：", cells[0].cell_contents)
print("另一个闭包互不影响：", triple.__closure__[0].cell_contents)


def plain(x):
    return x + 1


print("不引用外层变量时 __closure__ 是：", plain.__closure__)

print("=== 同一外层里的两个闭包共享变量 ===")


def make_pair():
    n = 0

    def get():
        return n

    def inc():
        nonlocal n
        n += 1

    return get, inc


get, inc = make_pair()
print("初始：", get())
inc()
inc()
print("两次 inc 之后：", get())
print("两个闭包的 cell 是同一个对象：", get.__closure__[0] is inc.__closure__[0])