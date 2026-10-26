"""ch14_03_special.py —— 类作用域、推导式作用域与海象运算符的特殊规则"""

print("=== 1. 类体是按顺序执行的普通语句块 ===")


class C:
    value = 10
    doubled = value * 2

    def method(self):
        return value


print("类体内可以直接用前面的类变量：", C.doubled)
try:
    C().method()
except NameError as e:
    print("方法体里却看不到：NameError:", e)


class D:
    value = 10

    def method(self):
        return self.value


print("正确做法是用 self 访问：", D().method())

print("=== 2. 推导式有独立作用域，同样看不到类变量 ===")
try:
    class E:
        value = 10
        squares = [value * i for i in range(3)]
except NameError as e:
    print("NameError:", e)


class F:
    value = 10
    squares = [i * i for i in range(3)]


print("不引用类变量的推导式没问题：", F.squares)

print("=== 3. for 循环变量泄漏，推导式变量不泄漏 ===")
for i in range(3):
    pass
print("for 结束后 i =", i)

squares = [j * j for j in range(3)]
print("推导式结果：", squares)
try:
    print(j)
except NameError as e:
    print("NameError:", e)

print("=== 4. 海象运算符是例外：值会送到外层 ===")
values = [(last := x * 10) for x in range(4)]
print("列表：", values)
print("海象留在外层的 last =", last)

print("=== 5. locals() / globals() ===")


def show_locals():
    a = 1
    b = 2
    return sorted(locals())


print("函数内的局部名字：", show_locals())
print("模块级 globals 里有 __name__：", "__name__" in globals())
print("模块级 globals 里有 __builtins__：", "__builtins__" in globals())

print("=== 6. 函数体里的名字在调用时才解析 ===")


def caller():
    return later()


def later():
    return "later 在这里"


print(caller())

print("=== 7. 同层重复定义：后者覆盖前者，但闭包看的是同一份绑定 ===")


def same_scope():
    def helper():
        return "第一版"

    def first():
        return helper()

    def helper():
        return "第二版"

    return first()


print(same_scope())