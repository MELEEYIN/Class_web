"""ch03_04_convert.py —— 类型转换、真值与 None"""
print(int("42"), int("  7  "), int("-8"))
print(int("1f", 16), int("0b1010", 2), int("1_000"))
print(int(3.99), int(-3.99), round(3.99))
print(float("1e3"), float("0.5"), float("inf") > 10 ** 308)
print(str(1.0), str(10), str(True), str([1, 2]))
print(list("abc"), tuple([1, 2]), sorted({"b", "a"}))

print("--- 真值判断 ---")
for v in [0, 3, -1, 0.0, "", "0", [], [0], {}, None]:
    print(f"{v!r:>6}  ->  {bool(v)}")

print("--- None ---")
def find(xs, target):
    for i, v in enumerate(xs):
        if v == target:
            return i
    return None

print(find([3, 1, 4], 4), find([3, 1, 4], 9))
idx = find([3, 1, 4], 9)
print("用 is 判断:", idx is None)
print("用 == 判断的坑:", idx == 0)

print("--- 会炸的转换 ---")
for expr in ['int("abc")', 'int("3.5")', 'int(None)', 'float("1,5")']:
    try:
        eval(expr)
    except (ValueError, TypeError) as e:
        print(f"{expr:<14} -> {type(e).__name__}: {e}")