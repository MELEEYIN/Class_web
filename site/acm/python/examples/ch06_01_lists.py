"""ch06_01_lists.py —— 列表：增删改查、原地方法与返回值陷阱"""
nums = [3, 1, 4, 1, 5]
print("原列表：", nums, "长度：", len(nums))

print("=== 增 ===")
nums.append(9)
nums.extend([2, 6])
nums.insert(0, 0)
print(nums)

print("=== 删：四种姿势 ===")
last = nums.pop()
first = nums.pop(0)
nums.remove(1)
del nums[-1]
print(nums, "| pop 出：", last, first)
try:
    nums.remove(99)
except ValueError as e:
    print("ValueError:", e)

print("=== 查 ===")
data = [10, 20, 20, 30]
print(data.index(20), data.count(20), 30 in data, 99 in data)

print("=== 原地方法返回 None：NoneType 报错的头号来源 ===")
a = [3, 1, 2]
b = a.sort()
print("a =", a, "| b =", b)
try:
    b.append(4)
except AttributeError as e:
    print("AttributeError:", e)
print("sorted 返回新列表：", sorted(a), "| a 仍是", a)

print("=== 排序 key ===")
words = ["pear", "fig", "banana"]
print(sorted(words, key=len), sorted(words, key=lambda w: (len(w), w)))
print(sorted([(2, "b"), (1, "z")]))

print("=== 切片赋值能改长度 ===")
c = [1, 2, 3, 4, 5]
c[1:4] = ["x"]
print(c)
c[1:2] = []
print(c)

print("=== 嵌套列表的别名陷阱 ===")
grid = [[0] * 2] * 2
grid[0][0] = 1
print(grid, "| 两个子列表是同一对象：", grid[0] is grid[1])
grid2 = [[0] * 2 for _ in range(2)]
grid2[0][0] = 1
print(grid2, "| 独立子列表：", grid2[0] is not grid2[1])