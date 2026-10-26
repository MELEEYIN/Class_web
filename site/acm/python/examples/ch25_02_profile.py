import cProfile
import pstats
import timeit
import tracemalloc


def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


def build(n):
    return [i * i for i in range(n)]


profiler = cProfile.Profile()
profiler.enable()
value = fib(20)
rows = build(100_000)
profiler.disable()

print("fib(20) =", value, "| build 结果长度:", len(rows))

stats = pstats.Stats(profiler)
key = (fib.__code__.co_filename, fib.__code__.co_firstlineno, "fib")
print("fib 被调用次数:", stats.stats[key][1])
print("统计条目数 >= 2:", len(stats.stats) >= 2)


def scan_count(data, target):
    ops = 0
    for x in data:
        ops += 1
        if x == target:
            break
    return ops


hay = list(range(1000))
hay_set = set(hay)
print("线性扫描到末位需要比较:", scan_count(hay, 999), "次")

t_list = timeit.timeit(lambda: 999 in hay, number=1000)
t_set = timeit.timeit(lambda: 999 in hay_set, number=1000)
print("list 版比 set 版慢 100 倍以上:", t_list > t_set * 100)

t0 = timeit.default_timer()
total = sum(build(50_000))
elapsed = timeit.default_timer() - t0
print("求和结果:", total, "| 耗时小于 1 秒:", elapsed < 1.0)

tracemalloc.start()
chunks = [bytearray(1000) for _ in range(10)]
snapshot = tracemalloc.take_snapshot()
tracemalloc.stop()
top = snapshot.statistics("filename")[0]
print("内存快照条目 > 0:", len(snapshot.statistics("filename")) > 0)
print("最大块至少 9000 字节:", top.size >= 9000)
print("chunks 占用约 10000 字节:", 9_000 <= sum(len(c) for c in chunks) <= 11_000)