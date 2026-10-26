import math


def approx(a, b, tol=1e-9):
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def check(cond, desc):
    print(("ok    " if cond else "FAIL  ") + desc)
    return cond


results = [
    check(approx(0.1 + 0.2, 0.3), "0.1+0.2 约等于 0.3"),
    check(not (0.1 + 0.2 == 0.3), "但 0.1+0.2 == 0.3 为假，所以不能用 =="),
    check(approx(1e-12, 0.0), "1e-12 在默认绝对容差之内"),
    check(not approx(1e-12, 0.0, 1e-13), "容差收紧到 1e-13 后不通过"),
    check(approx(1e9, 1e9 + 1.0), "相对容差让大数的 1 之差也可接受"),
]
print("通过", sum(results), "/", len(results))


def safe_div(a, b):
    if b == 0:
        raise ValueError("除数不能为 0")
    return a / b


for args, want in [((6, 3), 2), ((1, 4), 0.25)]:
    got = safe_div(*args)
    print("边界内:", args, "→", got, "| 与期望一致:", approx(got, want))

try:
    safe_div(1, 0)
except ValueError as e:
    print("异常路径:", type(e).__name__, "|", e)