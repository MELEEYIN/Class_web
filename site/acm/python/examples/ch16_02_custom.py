"""ch16_02_custom.py —— 自定义异常、raise from、assert"""


class AppError(Exception):
    """所有业务异常的基类"""


class ValidationError(AppError):
    def __init__(self, field, value):
        super().__init__(f"字段 {field} 的值 {value!r} 非法")
        self.field = field
        self.value = value


class NotFoundError(AppError):
    pass


print("=== 自定义异常可以带结构化数据 ===")
try:
    raise ValidationError("age", -1)
except AppError as e:
    print("类型：", type(e).__name__)
    print("消息：", e)
    print("附带字段：", e.field, "| 附带值：", e.value)
    print("是 AppError 的子类：", isinstance(e, AppError))
    print("也是 Exception 的子类：", isinstance(e, Exception))

print("=== 按基类捕获所有业务异常 ===")
for exc in (ValidationError("name", ""), NotFoundError("用户不存在")):
    try:
        raise exc
    except AppError as e:
        print(f"  [{type(e).__name__}] {e}")

print("=== raise from：把原因挂成 __cause__ ===")
try:
    try:
        int("abc")
    except ValueError as e:
        raise AppError("解析配置失败") from e
except AppError as e:
    print("最外层消息：", e)
    print("原因类型：", type(e.__cause__).__name__)
    print("原因消息：", e.__cause__)

print("=== 不写 from：解释器自动挂 __context__ ===")
try:
    try:
        int("abc")
    except ValueError:
        raise AppError("没写 from 的版本")
except AppError as e:
    print("__context__ 类型：", type(e.__context__).__name__)
    print("__cause__ 是：", e.__cause__)

print("=== from None：主动切断原因链 ===")
try:
    try:
        int("abc")
    except ValueError:
        raise AppError("对外只暴露这个") from None
except AppError as e:
    print("__cause__：", e.__cause__, "| __suppress_context__：", e.__suppress_context__)

print("=== assert 只在调试期可靠 ===")


def set_age(age):
    assert age >= 0, f"age 不能为负，收到 {age}"
    return age


print("合法值：", set_age(3))
try:
    set_age(-1)
except AssertionError as e:
    print("AssertionError:", e)

print("=== 异常对象可以携带任意属性 ===")
err = AppError("业务失败")
err.code = 4001
err.detail = {"retry": False}
print(err.code, err.detail)

print("=== 异常的 __str__ 与 repr ===")
print("str：", str(err))
print("repr：", repr(err))