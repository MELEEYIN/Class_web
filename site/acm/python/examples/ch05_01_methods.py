"""ch05_01_methods.py —— 字符串不可变、常用方法与切片式查询"""
s = "Hello, Python"
print("长度（字符数）：", len(s))
print("长度（UTF-8 字节数）：", len(s.encode("utf-8")), len("中文".encode("utf-8")))

print("=== 不可变：所有修改都返回新串 ===")
t = s.lower()
print(s, "|", t, "| 原串没变:", s is not t)
try:
    s[0] = "h"
except TypeError as e:
    print("TypeError:", e)
try:
    print(s + 1)
except TypeError as e:
    print("TypeError:", e)

print("=== 清洗与切分 ===")
print(repr("  hi \n".strip()), repr("xxhixx".strip("x")))
print("a,b,,c".split(","))
print("a b  c\n d".split())
print("a,b,c".split(",", 1))
print("x".join(["a", "b"]))
print("=" * 10)

print("=== 查询：find 给 -1，index 抛异常 ===")
print(s.find("Python"), s.find("Java"))
try:
    s.index("Java")
except ValueError as e:
    print("ValueError:", e)
print(s.count("l"), s.startswith(("Hi", "Hello")), s.endswith("on"))
print("包含判断：", "Python" in s)

print("=== 变形与排版 ===")
print("42".zfill(5), "ab".center(6, "*"), "ab".ljust(5, ".") + "|")
print("PyThOn".lower(), "PyThOn".upper(), "py thon".title(), "py thon".capitalize())
print("a1".isalnum(), "42".isdigit(), "abc".isalpha())
print(repr("  多余空白  ".strip()))