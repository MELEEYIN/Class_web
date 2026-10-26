"""ch09_03_genexp.py —— 生成器表达式：惰性、一次性、省内存"""
import itertools

gen = (x * x for x in range(5))
print("类型：", type(gen).__name__)
print("逐个取：", next(gen), next(gen))
print("剩余转列表：", list(gen))
print("已耗尽，带默认值取：", next(gen, "空"))
try:
    next(gen)
except StopIteration as e:
    print("StopIteration:", repr(e))

print("=== 直接喂给聚合函数 ===")
print("sum：", sum(x * x for x in range(5)))
print("max：", max(len(w) for w in ["a", "bbb", "cc"]))
print("any/all：", any(x > 3 for x in range(5)), all(x >= 0 for x in range(5)))
print("join：", "-".join(str(x) for x in range(3)))

print("=== 长度对比：列表要全部算完，生成器按需 ===")
lst = [x for x in range(1000)]
g = (x for x in range(1000))
print("列表能 len：", len(lst), "| 生成器不能 len，只能数：", sum(1 for _ in g))

print("=== 推导式里的循环变量不外泄 ===")
x = "外部"
print([x for x in range(3)], "| 外部 x 仍是：", x)

print("=== 惰性：可以套在无限流上 ===")
squares = (x * x for x in itertools.count(1))
print("前 4 个平方：", list(itertools.islice(squares, 4)))

print("=== 注意：生成器只能消费一次 ===")
g2 = (c for c in "ab")
print("sum 吃掉后：", "".join(g2), "| 再取给默认值：", next(g2, "空"))