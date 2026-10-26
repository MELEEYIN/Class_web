import traceback


def parse(text):
    return int(text)


def load(raw):
    try:
        return parse(raw)
    except ValueError as e:
        raise RuntimeError("解析配置失败") from e


def main():
    try:
        load("abc")
    except RuntimeError as e:
        tb = traceback.extract_tb(e.__traceback__)
        print("帧数:", len(tb))
        print("调用链:", " -> ".join(f.name for f in tb))
        print("本层异常:", type(e).__name__, "|", e)
        cause = e.__cause__
        print("根因:", type(cause).__name__, "|", cause)
        print("只格式化异常行:", traceback.format_exception_only(type(cause), cause)[0].strip())
        print("是否自动产生的上下文:", e.__context__ is cause)


main()

try:
    assert 3 * 7 == 22, f"乘法算错了：3*7 = {3 * 7}"
except AssertionError as e:
    print("断言失败信息:", e)

print("__debug__ =", __debug__, "（用 python -O 运行会变成 False，assert 全部消失）")

try:
    {}["缺失的键"]
except KeyError as e:
    print("KeyError 的参数是键本身:", e, "| repr:", repr(e))
    print("想打印消息要用 e.args:", e.args)