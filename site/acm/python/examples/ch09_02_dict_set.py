"""ch09_02_dict_set.py —— 字典、集合推导式与反查表"""
words = ["apple", "Banana", "cherry"]
print("长度表：", {w: len(w) for w in words})
print("带过滤：", {w: len(w) for w in words if len(w) > 5})
print("反转键值：", {v: k for k, v in {"a": 1, "b": 2}.items()})
print("下标表：", {w: i for i, w in enumerate(words)})
print("键重复时后者覆盖：", {len(w) % 2: w for w in words})
print("按长度合并：", {len(w): w for w in words})

print("=== 集合推导式 ===")
print("去重后的长度：", sorted({len(w) for w in words}))
print("平方的个位：", sorted({x * x % 10 for x in range(5)}))
print("与 map 等价：", sorted(set(map(len, words))))

print("=== 用推导式建索引：查表代替循环 ===")
prices = {"苹果": 5, "香蕉": 3}
print("总价：", sum(prices[f] * n for f, n in [("苹果", 2), ("香蕉", 4)]))
by_len = {len(w): w for w in words}
print("长度为 6 的词：", by_len.get(6))