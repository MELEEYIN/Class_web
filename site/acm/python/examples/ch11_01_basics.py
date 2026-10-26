"""ch11_01_basics.py —— lambda 只有一个表达式：语法、限制与等价写法"""
add = lambda a, b: a + b
print(add(2, 3), "| 名字：", add.__name__)

square = lambda x: x * x
print(square(5))

print("=== 表达式 vs 语句 ===")
print("三元也是表达式：", (lambda x: "偶" if x % 2 == 0 else "奇")(4))
for bad in ["lambda x: x = 1", "f = lambda x: return x", "lambda x, y: x; y"]:
    try:
        compile(bad, "<s>", "exec")
        print("能编译：", bad)
    except SyntaxError as e:
        print(f"{bad!r} -> SyntaxError: {e.msg}")

print("=== 默认值、无参、*args 都能用 ===")
print((lambda: "无参")())
print((lambda a, b=10: a * b)(3))
print((lambda *xs: sum(xs))(1, 2, 3))

print("=== 立即调用 ===")
print((lambda n: n * 2)(21))

print("=== lambda 里也能写条件与推导式 ===")
print((lambda xs: [x for x in xs if x > 0])([-1, 2, -3, 4]))
print((lambda d: d.get("k", "默认"))({"a": 1}))