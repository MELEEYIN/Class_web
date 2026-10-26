"""ch09_01_listcomp.py —— 列表推导式：过滤、映射、嵌套与条件位置"""
import itertools

nums = list(range(1, 11))
print("平方：", [x * x for x in nums])
print("偶数平方：", [x * x for x in nums if x % 2 == 0])
print("奇偶标记：", ["偶" if x % 2 == 0 else "奇" for x in nums[:4]])
print("两个 for：", [(i, j) for i in range(2) for j in range(2)])
out = []
for i in range(2):
    for j in range(2):
        out.append((i, j))
print("上面的写法等价于：", out)

print("=== 嵌套推导式造二维表 ===")
print([[i * j for j in range(1, 4)] for i in range(1, 4)])

print("=== 展平二维 ===")
grid = [[1, 2], [3, 4]]
print("读懂顺序：for row -> for x：", [x for row in grid for x in row])
print("对照 itertools.chain：", list(itertools.chain.from_iterable(grid)))

print("=== 过滤 + 变换 ===")
words = ["Hello", "world", "", "  "]
print([w.strip().lower() for w in words if w.strip()])

print("=== 条件的位置决定语义 ===")
print("if 在 for 后 = 过滤：", [x for x in nums if x > 8])
print("if/else 在 for 前 = 变换：", [x if x > 8 else 0 for x in nums])
try:
    compile("[x for x in range(3) if x > 1 else 0]", "<s>", "eval")
except SyntaxError as e:
    print("过滤位置不能写 else -> SyntaxError:", e.msg)