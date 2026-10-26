"""ch10_02_varargs.py —— *args、**kwargs、仅关键字与仅位置参数"""


def total(*args):
    return sum(args)


print(total(), total(1, 2, 3))


def show(*args, **kwargs):
    print("args:", args, "| kwargs:", kwargs)


show(1, 2, name="a", age=3)

print("=== 调用时解包 ===")
nums = [1, 2, 3]
print("total(*nums)：", total(*nums))


def point(x, y, z=0):
    return (x, y, z)


print(point(*[1, 2], **{"z": 9}))

print("=== 转发：包装函数原样传递参数 ===")


def logged(fn):
    def wrapper(*args, **kwargs):
        print(f"调用 {fn.__name__} args={args} kwargs={kwargs}")
        return fn(*args, **kwargs)
    return wrapper


@logged
def add(a, b, base=0):
    return a + b + base


print("结果：", add(2, 3, base=10))

print("=== 仅关键字参数：* 之后必须写名字 ===")


def rect(*, width, height):
    return width * height


print(rect(width=2, height=3))
try:
    rect(2, 3)
except TypeError as e:
    print("TypeError:", e)

print("=== 仅位置参数：/ 之前不能写名字（3.8+） ===")


def power(base, /, exp=2):
    return base ** exp


print(power(3), power(3, 3))
try:
    power(base=3)
except TypeError as e:
    print("TypeError:", e)

print("=== 完整的参数顺序 ===")


def full(a, b=2, /, c=3, *args, d, e=5, **kwargs):
    return (a, b, c, args, d, e, kwargs)


print(full(1, d=4))
print(full(1, 2, 3, 4, 5, d=6, x=7))