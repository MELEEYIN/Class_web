import concurrent.futures as cf
import os
import sys


def cpu_task(n):
    return sum(i * i for i in range(n))


if __name__ == "__main__":
    print("逻辑 CPU 数 >= 1:", os.cpu_count() >= 1)
    print("GIL 切换间隔:", sys.getswitchinterval())

    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        print("线程池 map（保序）:", list(ex.map(cpu_task, [10, 20, 30])))
        futs = [ex.submit(str.upper, w) for w in ["a", "b"]]
        print("submit 逐个取结果:", [f.result() for f in futs])

    with cf.ThreadPoolExecutor(max_workers=1) as ex:
        bad = ex.submit(lambda: 1 / 0)
        try:
            bad.result()
        except ZeroDivisionError as e:
            print("子线程异常被传回:", type(e).__name__, "|", e)

    with cf.ProcessPoolExecutor(max_workers=2) as ex:
        print("进程池 map（真并行，数据要能 pickle）:", sorted(ex.map(cpu_task, [10, 20])))

    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        done = [fut.result() for fut in cf.as_completed(
            [ex.submit(cpu_task, n) for n in (5, 6)])]
        print("as_completed 顺序不保证，排序后:", sorted(done))