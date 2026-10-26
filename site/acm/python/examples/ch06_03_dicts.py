"""ch06_03_dicts.py —— 字典：查找、默认值、插入序与合并"""
scores = {"语文": 92, "数学": 88}
print(scores, len(scores))
scores["英语"] = 95
scores["语文"] = 90
print("插入序即遍历序：", scores)
print("键：", list(scores), "| 值：", list(scores.values()))

print("=== 取值三种方式 ===")
print(scores["数学"])
print(scores.get("化学"), "|", scores.get("化学", 0))
try:
    scores["化学"]
except KeyError as e:
    print("KeyError:", e)

print("=== 计数：get 与 setdefault ===")
cnt = {}
for ch in "abca":
    cnt[ch] = cnt.get(ch, 0) + 1
print(cnt)
cnt2 = {}
for ch in "abca":
    cnt2.setdefault(ch, 0)
    cnt2[ch] += 1
print(cnt2, "| 已有键时 setdefault 返回旧值：", cnt2.setdefault("a", 999))

print("=== 删除与弹出 ===")
d = {"a": 1, "b": 2}
print(d.pop("a"), d, d.pop("zz", "默认值"))
del d["b"]
print(d)
try:
    d.pop("b")
except KeyError as e:
    print("KeyError:", e)

print("=== 合并：update 原地，| 新建 ===")
x = {"a": 1, "b": 2}
y = {"b": 20, "c": 30}
z = x | y
print("| 结果：", z, "| x 未变：", x)
x.update(y)
print("update 后 x：", x)
print("** 解包构造：", {**y, "d": 4})

print("=== 遍历与构造 ===")
for k, v in {"p": 1, "q": 2}.items():
    print(k, v)
print(dict(zip(["a", "b"], [1, 2])))
print(dict(a=1, b=2))
print("键可以是元组：", {("x", 1): "点"}[("x", 1)])
try:
    {["x"]: 1}
except TypeError as e:
    print("TypeError:", e)