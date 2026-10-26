import sys
from unittest.mock import MagicMock, patch

mod = sys.modules[__name__]


def now():
    import time
    return time.time()


def is_expired(created, ttl=60):
    return now() - created > ttl


with patch.object(mod, "now", return_value=1000.0):
    print("未过期:", not is_expired(970.0))
    print("已过期:", is_expired(900.0))

fake = MagicMock(return_value={"ok": True})
print("返回值:", fake("/api"))
print("调用参数:", fake.call_args)
print("调用次数:", fake.call_count)
fake.assert_called_once_with("/api")

send = MagicMock()
for i in range(3):
    send(i)
print("全部调用:", [c.args for c in send.call_args_list])

client = MagicMock()
client.get.return_value.status_code = 200
resp = client.get("https://example.com")
print("链式属性打桩:", resp.status_code, "| 调用的方法名:", client.get.call_args.args)

with patch.object(mod, "now", side_effect=RuntimeError("时钟坏了")):
    try:
        is_expired(1.0)
    except RuntimeError as e:
        print("side_effect 抛异常:", e)