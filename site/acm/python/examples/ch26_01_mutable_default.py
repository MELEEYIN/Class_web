# 示例：examples/ch26_01_mutable_default.py


def add_item_bad(item, bucket=[]):
    bucket.append(item)
    return bucket


def add_item_ok(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


print("默认参数只在定义时求值一次，所以两次调用共用同一个列表：")
print(" 第 1 次:", add_item_bad("a"))
print(" 第 2 次:", add_item_bad("b"))
print(" 默认值就存在函数对象上:", add_item_bad.__defaults__)

print()
print("None 哨兵版每调用一次新建一个：")
print(" 第 1 次:", add_item_ok("a"))
print(" 第 2 次:", add_item_ok("b"))

print()
rows = [[0] * 2] * 2          # 外层 tuple 重复的是同一个 list 的引用
rows[0][0] = 9
print("[[0]*2]*2 只改一格:", rows)

grid = [[0] * 2 for _ in range(2)]
grid[0][0] = 9
print("推导式版本只改一格:", grid)

print()
a = [1, 2]
b = a
b.append(3)
print("b = a 之后改 b，a 也变了:", a, "| 是同一对象:", a is b)
c = a[:]
c.append(4)
print("a[:] 拷贝后改 c，a 不变:", a, c)