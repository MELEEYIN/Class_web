import asyncio
import time


async def worker(name):
    print(name, "开始")
    await asyncio.sleep(0)          # 主动让出控制权，另一个任务才有机会跑
    print(name, "结束")
    return name * 2


def blocking(n):                    # 同步阻塞函数
    return sum(i * i for i in range(n))


async def main():
    print("gather 返回值:", await asyncio.gather(worker("A"), worker("B")))

    print("to_thread 把阻塞调用丢进线程:", await asyncio.to_thread(blocking, 10))

    t0 = time.perf_counter()
    await asyncio.gather(*(asyncio.sleep(0.05) for _ in range(5)))
    print("5 个 0.05s 并发，用时 < 0.15s:", time.perf_counter() - t0 < 0.15)

    try:
        async with asyncio.timeout(0.05):
            await asyncio.sleep(1)
    except TimeoutError:
        print("超时类型:", TimeoutError.__name__)

    async def slow():
        await asyncio.sleep(10)

    task = asyncio.create_task(slow())
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("取消后状态:", task.cancelled(), "| 异常类型: CancelledError")

    return "done"


print("asyncio.run 返回:", asyncio.run(main()))