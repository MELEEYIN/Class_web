"""ch07_01_basics.py —— 切片的半开区间、省略端点与越界规则"""
s = "Python"
nums = [0, 1, 2, 3, 4, 5]
print(s[0:2], s[2:], s[:2], s[:])
print("半开区间：s[1:3] =", repr(s[1:3]), "| 长度", len(s[1:3]))
print("越界不报错：", repr(s[0:100]), "|", nums[10:], "|", nums[:10])
print("空切片：", repr(s[4:2]), nums[4:2])
print("负下标：", s[-1], repr(s[-2:]), repr(s[:-2]), repr(s[-100:2]))
print("单下标越界才报错：")
try:
    s[100]
except IndexError as e:
    print("IndexError:", e)
print("省略等于全长：", s[:] == s[0:len(s)])
print("原对象不受影响：", s, nums)
print("单字符切片的类型：", type(s[0]).__name__, repr(s[0]))