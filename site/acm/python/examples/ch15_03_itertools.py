"""ch15_03_itertools.py —— itertools 与生成器流水线"""
import itertools

print("=== 无限迭代器必须配 islice ===")
print(list(itertools.islice(itertools.count(10, 2), 5)))
print(list(itertools.islice(itertools.cycle("ab"), 5)))
print(list(itertools.repeat("x", 3)))

print("=== chain / zip / zip_longest ===")
print(list(itertools.chain([1, 2], "cd", (3,))))
print(list(zip([1, 2, 3], "ab")))
print(list(itertools.zip_longest([1, 2, 3], "ab", fillvalue="-")))
print(list(itertools.pairwise("abcd")))

print("=== accumulate / groupby ===")
print(list(itertools.accumulate([1, 2, 3, 4])))
print(list(itertools.accumulate([1, 2, 3, 4], lambda a, b: a * b)))

data = sorted([("a", 1), ("b", 2), ("a", 3)], key=lambda p: p[0])
for key, group in itertools.groupby(data, key=lambda p: p[0]):
    print(key, list(group))

print("=== combinations / permutations / product ===")
print(list(itertools.combinations("abc", 2)))
print(list(itertools.permutations("ab")))
print(list(itertools.product([1, 2], "xy")))

print("=== 生成器流水线：读 -> 过滤 -> 转换 -> 汇总 ===")
rows = [" 1,2 ", "3,4", "坏行", "5,6"]


def parse(rows):
    for r in rows:
        parts = r.strip().split(",")
        if len(parts) != 2:
            continue
        yield int(parts[0]), int(parts[1])


def scaled(pairs, k):
    for a, b in pairs:
        yield a * k, b * k


total = sum(a + b for a, b in scaled(parse(rows), 10))
print("全部合格行的合计（放大 10 倍）：", total)

first_pair = next(parse(rows))
print("只取第一对：", first_pair)

print("=== tee：把一个迭代器分两路（缓存会增长，慎用大流） ===")
src = iter([1, 2, 3])
a, b = itertools.tee(src, 2)
print("第一路：", list(a))
print("第二路：", list(b))

print("=== 生成器函数里的 return 会终结迭代 ===")


def gen_with_return():
    yield 1
    return
    yield 2


print(list(gen_with_return()))