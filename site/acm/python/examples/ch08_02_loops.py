"""ch08_02_loops.py —— range、enumerate、zip 与循环 else"""
print("=== range 是半开区间 ===")
print(list(range(5)))
print(list(range(2, 6)))
print(list(range(10, 0, -3)))
r = range(0, 10, 2)
print("range 是惰性序列：", r, "| 长度", len(r), "| 第 3 个元素", r[3])
print("range 支持 in（O(1) 算术判断）：", 4 in r, 5 in r)

print("=== for 遍历的是可迭代对象 ===")
for ch in "ab":
    print("字符", ch)
for k, v in [("a", 1), ("b", 2)]:
    print(k, v)
for i in range(2):
    print("range 循环", i)

print("=== enumerate 与 zip ===")
for i, name in enumerate(["甲", "乙"], start=1):
    print(i, name)
names = ["甲", "乙"]
ages = [20, 21]
print(list(zip(names, ages)))
print("不等长按最短截断：", list(zip(names, ages, [1, 2, 3])))

print("=== while ===")
n = 3
while n > 0:
    print("倒计时", n)
    n -= 1

print("=== for/while 的 else：没被 break 才执行 ===")
for i in range(5):
    if i == 2:
        break
else:
    print("不会执行：被 break 打断了")
for i in range(5):
    if i == 6:
        break
else:
    print("会执行：循环正常走完")

print("=== continue 与 break ===")
for i in range(6):
    if i % 2:
        continue
    if i == 4:
        break
    print("偶数", i)