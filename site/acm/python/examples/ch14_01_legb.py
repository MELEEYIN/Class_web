"""ch14_01_legb.py —— LEGB 四层查找实证"""
x = "global"


def outer():
    x = "enclosing"

    def inner():
        print("inner 看到：", x)

    inner()
    print("outer 看到：", x)


outer()
print("模块级看到：", x)

print("=== 名字解析由赋值决定：局部优先 ===")


def shadow():
    x = "local"
    print("shadow 里：", x)


shadow()
print("模块级仍是：", x)

print("=== 找不到才往外走，最后才是内置 ===")
print(len("abc"))


def use_builtin():
    return len([1, 2, 3])


print(use_builtin())

print("=== 局部判定是编译期决定的 ===")


def broken():
    print("调用前 x 是：", x)
    x = "local"


try:
    broken()
except UnboundLocalError as e:
    print("UnboundLocalError:", e)

print("=== 从 __code__ 看编译期的判定 ===")
print("broken 的局部变量：", broken.__code__.co_varnames)
print("broken 引用的全局名：", broken.__code__.co_names)
print("outer 的局部变量：", outer.__code__.co_varnames)
print("外层的 cell 变量：", outer.__code__.co_cellvars)

print("=== 遮蔽内置名字的代价 ===")
list = [1, 2, 3]
print("list 现在是：", list)
try:
    print(list("ab"))
except TypeError as e:
    print("TypeError:", e)
del list
print("del 之后 list 恢复：", list("ab"))