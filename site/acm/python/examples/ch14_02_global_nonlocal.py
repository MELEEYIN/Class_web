"""ch14_02_global_nonlocal.py —— global / nonlocal 的边界"""

count = 0


def bump():
    global count
    count += 1


bump()
bump()
print("count =", count)

print("=== 只读全局变量不需要 global ===")
message = "模块级消息"


def read_only():
    return message


print(read_only())

print("=== global 可以在函数里新建模块级名字 ===")
print("调用前 'fresh' 在 globals 里吗：", "fresh" in globals())


def make_global():
    global fresh
    fresh = "由函数创建"


make_global()
print("调用后 'fresh' 在 globals 里吗：", "fresh" in globals(), "| 值：", fresh)

print("=== nonlocal 可以跨多层 ===")


def outer():
    n = 0

    def mid():
        nonlocal n

        def inner():
            nonlocal n
            n += 1

        inner()
        inner()

    mid()
    return n


print("inner 改到了 outer 的 n：", outer())

print("=== global 直接跳到模块级，跳过外层 ===")
level = "模块级"


def outer2():
    level = "外层"

    def inner2():
        global level
        return level

    return inner2()


print("inner2 返回：", outer2())

print("=== nonlocal 不能指向模块级 ===")
src = "def f():\n    nonlocal level\n"
try:
    compile(src, "<s>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg)

print("=== 同一层里 nonlocal 也必须真有外层绑定 ===")
src2 = "def g():\n    x = 0\n    nonlocal x\n"
try:
    compile(src2, "<s>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg)