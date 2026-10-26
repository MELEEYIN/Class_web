# 示例：examples/ch26_02_loop_mutation.py

nums = [1, 2, 2, 3, 2, 4]

bad = nums[:]
for x in bad:
    if x == 2:
        bad.remove(x)
print("边遍历边删（漏删）:", bad)

good = [x for x in nums if x != 2]
print("推导式过滤      :", good)

good2 = nums[:]
for x in nums[:]:              # 遍历副本，改原列表
    if x == 2:
        good2.remove(x)
print("遍历副本        :", good2)

print()
d = {"a": 1, "b": 2}
try:
    for k in d:
        d[k + "!"] = 0        # 边遍历边插入
except RuntimeError as e:
    print("遍历中改 dict 大小:", type(e).__name__ + ":", e)
print("遍历 list(d) 可行  :", sorted(k + "!" for k in list(d)))

print()
for i in range(3):
    pass
print("for 结束后 i 还在:", i)

handlers = [lambda: i for _ in range(3)]
print("lambda 晚绑定     :", [h() for h in handlers])
fixed = [lambda i=i: i for i in range(3)]
print("默认参数固定值    :", [f() for f in fixed])