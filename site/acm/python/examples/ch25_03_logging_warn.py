import logging
import sys
import warnings

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(levelname)s %(name)s %(message)s", force=True)
log = logging.getLogger("dbg")

log.debug("DEBUG 低于 INFO，默认不打印")
log.info("用户 %s 登录失败，第 %d/%d 次", "tom", 2, 5)
log.warning("磁盘剩余 %d MB", 120)
log.error("数据库连接超时，重试 %d 次", 3)


def old_api():
    warnings.warn("old_api 将在 4.0 移除，请改用 new_api",
                  DeprecationWarning, stacklevel=2)


with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    old_api()
    print("捕获警告数:", len(caught))
    print("类别:", caught[0].category.__name__)
    print("消息:", caught[0].message)
    print("位置指向调用方:", caught[0].filename.endswith("ch25_03_logging_warn.py"))

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("error")
    try:
        old_api()
    except DeprecationWarning as e:
        print("把警告升级为异常后:", str(e))

print("__debug__ =", __debug__, "| 解释器:", sys.version_info.major, sys.version_info.minor)
print("日志是否低于阈值:", log.isEnabledFor(logging.DEBUG),
      "| 是否启用 INFO:", log.isEnabledFor(logging.INFO))