"""ch03_02_binding.py —— 变量是名字，不是盒子"""
a = [1, 2, 3]
b = a                    # 别名：两个名字贴同一个列表
b.append(4)
print("a =", a)
print("b =", b)
print("a is b :", a is b)

c = a[:]                 # 切片 = 浅拷贝，得到新列表
c.append(5)
print("a =", a)
print("c =", c)
print("a is c :", a is c)

x = 10
y = x
y += 1                   # int 不可变，+= 造出一个新对象
print("x, y =", x, y)

print("--- 函数参数：改内容 vs 换名字 ---")


def add_item(lst):
    lst.append("新")      # 原地修改，调用方看得见


def rebind(lst):
    lst = lst + ["新"]    # 重新绑定，调用方看不见


box1 = ["旧"]
add_item(box1)
print("add_item 之后:", box1)

box2 = ["旧"]
rebind(box2)
print("rebind 之后:", box2)

print("--- is 与 == ---")
p = int("256")
q = int("256")
print("256 缓存:", p is q, p == q)
r = int("300")
s = int("300")
print("300 不复用:", r is s, r == s)
print("None 只能用 is:", None is None, [] is [])