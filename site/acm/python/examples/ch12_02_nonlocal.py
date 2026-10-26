"""ch12_02_nonlocal.py —— nonlocal / global：什么时候必须声明"""


def counter_wrong():
    count = 0

    def inc():
        count += 1
        return count

    return inc


try:
    counter_wrong()()
except UnboundLocalError as e:
    print("UnboundLocalError:", e)


def counter_right():
    count = 0

    def inc():
        nonlocal count
        count += 1
        return count

    return inc


c = counter_right()
print("加上 nonlocal：", c(), c(), c())

print("=== 只读外层变量不需要 nonlocal ===")


def read_only():
    msg = "外层变量"

    def show():
        return msg

    return show


print(read_only()())

print("=== 改可变对象的内容也不需要 nonlocal ===")


def append_only():
    bucket = []

    def add(x):
        bucket.append(x)
        return bucket

    return add


a = append_only()
print(a(1), a(2))

print("=== global 改模块级变量 ===")
total = 0


def bump():
    global total
    total += 1


bump()
bump()
print("total =", total)

print("=== 用函数属性保存状态：另一种常见写法 ===")


def counter_obj():
    def inc():
        inc.count += 1
        return inc.count

    inc.count = 0
    return inc


c2 = counter_obj()
print(c2(), c2(), "| 属性值：", c2.count)