"""ch07_02_step.py —— 步长：反转、隔 n 取、负步长的边界"""
s = "0123456789"
print("s[::2]     =", s[::2])
print("s[1::2]    =", s[1::2])
print("s[::-1]    =", s[::-1])
print("s[8:2:-2]  =", s[8:2:-2])
print("s[-1:-4:-1]=", s[-1:-4:-1])
print("s[2:8:3]   =", s[2:8:3])
print("步长为 0：")
try:
    s[::0]
except ValueError as e:
    print("ValueError:", e)

nums = list(range(10))
print("每 3 个一组：", [nums[i:i + 3] for i in range(0, len(nums), 3)])
print("隔一个取一个再反转：", nums[::2][::-1])
print("掐头去尾各 2 个：", nums[2:-2])
print("负数步长只改方向，不改下标含义：", nums[5:2:-1], nums[2:5])