"""ch15_01_iterate.py —— for 的展开与 iter/next"""
items = [10, 20, 30]
it = iter(items)
print("iter(list) 的类型：", type(it).__name__)
print(next(it), next(it), next(it))
try:
    next(it)
except StopIteration as e:
    print("StopIteration:", repr(e))

print("=== 可迭代对象 vs 迭代器 ===")
print("list 有 __iter__：", hasattr(items, "__iter__"))
print("list 自己有 __next__ 吗：", hasattr(items, "__next__"))
print("iter(list) 有 __next__：", hasattr(it, "__next__"))
print("迭代器上 iter() 返回自己：", iter(it) is it)

print("=== 迭代器是一次性的 ===")
gen = (x * 2 for x in range(3))
print("第一次 list：", list(gen))
print("第二次 list：", list(gen))
print("列表可以反复迭代：", list(items), list(items))

print("=== for 的等价展开 ===")
it2 = iter(items)
total = 0
while True:
    try:
        total += next(it2)
    except StopIteration:
        break
print("while 循环求和：", total, "| sum()：", sum(items))

print("=== 自己实现一个迭代器类 ===")


class Countdown:
    def __init__(self, start):
        self.n = start

    def __iter__(self):
        return self

    def __next__(self):
        if self.n <= 0:
            raise StopIteration
        self.n -= 1
        return self.n + 1


print("解包进列表：", [*Countdown(3)])
c = Countdown(2)
print("第一遍：", list(c))
print("第二遍（已被耗尽）：", list(c))

print("=== 可变的迭代器：用 while 边改边迭代会很危险 ===")
nums = [1, 2, 3, 4]
for n in nums:
    if n == 2:
        nums.remove(n)
print("边遍历边删的结果：", nums)

print("=== 安全做法：先拷贝或反向遍历 ===")
nums2 = [1, 2, 3, 4]
for n in nums2[:]:
    if n == 2:
        nums2.remove(n)
print("遍历副本：", nums2)

print("=== enumerate / zip 返回的都是迭代器 ===")
e = enumerate("ab")
print(type(e).__name__, list(e), list(e))
z = zip([1, 2], "ab")
print(next(z), list(z))