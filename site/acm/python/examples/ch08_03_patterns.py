"""ch08_03_patterns.py —— 循环里的常用套路"""


def first_even(xs):
    """找第一个偶数，没有就返回 None"""
    for x in xs:
        if x % 2 == 0:
            return x
    return None


def find_pair(xs, target):
    """找第一对下标 i<j 满足和为 target"""
    for i in range(len(xs)):
        for j in range(i + 1, len(xs)):
            if xs[i] + xs[j] == target:
                return (i, j)
    return None


def gcd(a, b):
    """辗转相除"""
    while b:
        a, b = b, a % b
    return a


def has_duplicate(grid):
    """嵌套循环里发现重复立刻返回"""
    seen = set()
    for row in grid:
        for cell in row:
            if cell in seen:
                return True
            seen.add(cell)
    return False


print("=== 找第一个满足条件的：靠 return 提前退出 ===")
print(first_even([1, 3, 4, 5]), first_even([1, 3]))

print("=== 双层循环找下标对 ===")
print(find_pair([2, 7, 11, 15], 9), find_pair([1, 2], 99))

print("=== while：辗转相除求最大公约数 ===")
print(gcd(48, 18), gcd(17, 5))

print("=== 哨兵值：读到 0 停止累加 ===")
total = 0
for x in [3, 1, 0, 9]:
    if x == 0:
        break
    total += x
print("哨兵前的和：", total)

print("=== 嵌套循环的提前退出 ===")
print(has_duplicate([[1, 2], [2, 3]]), has_duplicate([[1, 2], [3, 4]]))

print("=== while True + break：命令循环 ===")
cmds = ["add", "add", "quit", "add"]
count = 0
for cmd in cmds:
    if cmd == "quit":
        break
    count += 1
print("执行了", count, "条命令")