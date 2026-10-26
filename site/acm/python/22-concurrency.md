# 22 · 并发：threading / multiprocessing / asyncio

> **本质**：Python 有三种并发手段，区别只在「谁在等」——线程让出 GIL 去等 IO，进程绕开 GIL 去占满多核，协程在单线程里靠 `await` 主动切换。选错模型，代码再对也快不了。

**读完这一章你能做到**

1. 说清 GIL 到底限制了什么：为什么多线程加速不了 CPU 密集，却能加速 IO 密集。
2. 用 `threading` + `Lock` + `queue.Queue` 写出没有竞态的线程代码。
3. 用 `concurrent.futures` 的线程池/进程池把任务分发出去，并知道 `map` 与 `as_completed` 的顺序差异。
4. 用 `asyncio` 写协程：`gather`、`TaskGroup`、超时、取消、`to_thread`。
5. 面对一个具体任务，30 秒内选出该用哪种模型。

## 22.1 三种模型一览

| 维度 | `threading` | `multiprocessing` | `asyncio` |
| --- | --- | --- | --- |
| 并发单位 | 线程（OS 调度） | 进程（OS 调度） | 协程（用户态调度） |
| 受 GIL 限制 | 是，同一时刻只有一个线程跑字节码 | 否，每进程一把 GIL | 单线程，不受影响 |
| 适合 | IO 密集、阻塞库调用 | CPU 密集、大数据并行 | 海量 IO 连接 |
| 内存共享 | 直接共享，要加锁 | 不共享，靠 Queue/管道/`Manager` pickle | 全部共享，天然无竞态（单线程） |
| 创建开销 | 小（几十微秒） | 大（数十毫秒，Windows 上要重新导入模块） | 极小（一个对象） |
| 数量级 | 几十个 | CPU 核数 | 几万到几十万 |
| 切换方式 | 抢占式（`sys.setswitchinterval`） | 抢占式 | 协作式（遇到 `await` 才切） |
| 典型用途 | 爬虫、读多个文件、调 API | 图像处理、数值计算、压测 | Web 服务、长连接、爬虫（aiohttp） |

## 22.2 GIL：同一时刻只有一个线程在执行字节码

CPython 用一把全局解释器锁保护对象引用计数，所以**任何时刻只有一个线程在跑 Python 字节码**。线程每隔 `sys.getswitchinterval()` 秒（默认 5ms）被要求交棒。

```pycon
>>> import sys, threading, os
>>> sys.getswitchinterval()
0.005
>>> os.cpu_count() >= 1
True
>>> threading.active_count()
1
```

由此得到两条铁律：

- **CPU 密集**：多线程没有收益，甚至因为抢锁更慢。要么换 `multiprocessing`，要么把热点丢给 C 扩展（numpy 内部就释放 GIL）。
- **IO 密集**：线程在等网络/磁盘时会释放 GIL，所以多线程能成倍提速。这也是「线程数 = 并发请求数」在爬虫里成立的原因。

> **💡 提示**：`sys.setswitchinterval(0.001)` 能把切换间隔调小。它对吞吐几乎总是负优化（切换有成本），只在调试竞态时有点用。别在生产里调它。

## 22.3 `threading`：start / join / Lock

`Thread(target=..., args=...)` 建对象，`start()` 才真正跑，`join()` 等它结束。**忘写 `join()` 是新手第一大坑**：主线程直接往下走，脚本结束时子线程被强杀，日志缺一半。

```pycon
>>> import threading
>>> out = []
>>> def work(n):
...     out.append(n * n)
...
>>> ts = [threading.Thread(target=work, args=(i,)) for i in range(3)]
>>> [t.start() for t in ts]
[None, None, None]
>>> [t.join() for t in ts]
[None, None, None]
>>> sorted(out)
[0, 1, 4]
```

不 `join` 的话 `out` 可能是 `[]`、`[0]`、`[1, 0]`……取决于调度。**线程的执行顺序没有任何保证**，所以输出一律排序或汇总后在主线程打印。

共享可变状态必须加锁。`+=` 不是原子操作：它由「读、加、写」三步组成，线程在这三步之间被切走就会丢更新。

```pycon
>>> import threading
>>> lock = threading.Lock()
>>> lock.acquire()
True
>>> lock.acquire(timeout=0.01)      # 同一线程再拿，锁不可重入
False
>>> lock.release()
>>> rlock = threading.RLock()
>>> rlock.acquire()
True
>>> rlock.acquire()                 # RLock 允许同一线程重入
True
```

`Lock` 与 `RLock` 的区别就是「同一线程能否重复获取」。递归函数里加锁必须用 `RLock`，否则第二次 `acquire` 就自己把自己锁死。首选写法是 `with lock:`，它保证异常时也释放。

```python
# 示例：examples/ch22_01_threads.py
import threading

results = []
lock = threading.Lock()
counter = 0


def work(name, n):
    total = sum(len(name) for _ in range(n))
    with lock:                          # 共享 list 的追加要加锁
        results.append((name, total, threading.current_thread().name))


def bump():
    global counter
    for _ in range(1000):
        with lock:
            counter += 1


print("启动前活跃线程数:", threading.active_count())

threads = [threading.Thread(target=work, args=(f"t{i}", i + 1), name=f"w{i}")
           for i in range(3)]
for t in threads:
    t.start()
for t in threads:
    t.join()
for row in sorted(results):
    print(row)

bumpers = [threading.Thread(target=bump) for _ in range(3)]
for t in bumpers:
    t.start()
for t in bumpers:
    t.join()
print("加锁后计数 =", counter, "（期望 3000）")

print("主线程名:", threading.current_thread().name)
print("是否还有存活的工作线程:", any(t.is_alive() for t in threads))
print("daemon 默认值:", threading.Thread(target=lambda: None).daemon)
```

```text
启动前活跃线程数: 1
('t0', 2, 'w0')
('t1', 4, 'w1')
('t2', 6, 'w2')
加锁后计数 = 3000 （期望 3000）
主线程名: MainThread
是否还有存活的工作线程: False
daemon 默认值: False
```

`daemon=True` 的线程不会阻止解释器退出——适合心跳、监控这类「跟着主程序一起死」的任务；需要保证完成的工作（写文件、发确认）绝不能用 daemon。

## 22.4 线程间通信：`queue.Queue`

**不要用 list 当线程间的队列**。`queue.Queue` 自带锁与条件变量，还提供阻塞式 `get`、有界 `maxsize`（满了 `put` 就阻塞，天然的背压）和 `task_done()`/`join()` 配对。

```pycon
>>> import queue
>>> q = queue.Queue(maxsize=1)
>>> q.put(1)
>>> q.full()
True
>>> q.get()
1
>>> try:
...     q.get(timeout=0.01)
... except queue.Empty:
...     print("Empty")
Empty
```

`get(timeout=...)` 超时抛 `queue.Empty`，`put(timeout=...)` 超时抛 `queue.Full`。**带超时的阻塞是退出循环的唯一安全方式**：不带超时的 `get()` 在生产者崩溃后会让消费者永远挂着，进程杀不掉也退不出。

```python
# 示例：examples/ch22_04_queue.py
import queue
import threading

q = queue.Queue(maxsize=3)          # 有界队列：put 满了会阻塞，这就是背压
out = []


def producer():
    for i in range(5):
        q.put(i)
    q.put(None)                     # 哨兵，通知消费者结束


def consumer():
    while True:
        item = q.get()
        if item is None:
            q.task_done()
            break
        out.append(item * 10)
        q.task_done()


tp = threading.Thread(target=producer)
tc = threading.Thread(target=consumer)
tp.start()
tc.start()
tp.join()
tc.join()
print("消费结果:", out)
print("队列剩余:", q.qsize(), "| 未完成任务:", q.unfinished_tasks)

lock = threading.Lock()
print("先拿到锁:", lock.acquire())
print("同一线程再拿（带超时）:", lock.acquire(timeout=0.01))
lock.release()

rlock = threading.RLock()
rlock.acquire()
print("RLock 同线程可重入:", rlock.acquire(blocking=False))
rlock.release()
rlock.release()

event = threading.Event()
seen = []


def waiter():
    seen.append("等")
    event.wait()                    # 阻塞到别的线程 set()
    seen.append("过")


t = threading.Thread(target=waiter)
t.start()
event.set()
t.join()
print("Event 唤醒:", seen)
```

```text
消费结果: [0, 10, 20, 30, 40]
队列剩余: 0 | 未完成任务: 0
先拿到锁: True
同一线程再拿（带超时）: False
RLock 同线程可重入: True
Event 唤醒: ['等', '过']
```

## 22.5 `concurrent.futures`：池化，别手搓线程

`ThreadPoolExecutor` / `ProcessPoolExecutor` 提供同一套 API，换一个类就换了并发模型——这是把「线程版」改成「进程版」最省事的方式。

```pycon
>>> import concurrent.futures as cf
>>> with cf.ThreadPoolExecutor(max_workers=2) as ex:
...     print(list(ex.map(str.upper, ["a", "b", "c"])))
...
['A', 'B', 'C']
>>> with cf.ThreadPoolExecutor(max_workers=1) as ex:
...     fut = ex.submit(int, "x")
...     try:
...         fut.result()
...     except ValueError as e:
...         print("传回主线程:", type(e).__name__)
...
传回主线程: ValueError
```

三个方法的分工：

| 方法 | 返回 | 顺序 | 异常 |
| --- | --- | --- | --- |
| `map(fn, it)` | 生成器，惰性取 | **按输入顺序** | 取值时才抛 |
| `submit(fn, *a)` | `Future` | 自己控制 | `future.result()` 时抛 |
| `as_completed(fs)` | 迭代器 | **完成顺序，不保证** | 取值时抛 |

`Future.result()` 会把子线程里的异常**原样抛回主线程**（带原始 traceback 链），所以别在子线程里 `try/except: pass` 吞掉——那样主线程永远不知道失败了。

```python
# 示例：examples/ch22_02_futures.py
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
```

```text
逻辑 CPU 数 >= 1: True
GIL 切换间隔: 0.005
线程池 map（保序）: [285, 2470, 8555]
submit 逐个取结果: ['A', 'B']
子线程异常被传回: ZeroDivisionError | division by zero
进程池 map（真并行，数据要能 pickle）: [285, 2470]
as_completed 顺序不保证，排序后: [30, 55]
```

## 22.6 `multiprocessing`：绕开 GIL

进程之间不共享内存，参数与返回值都要 **pickle** 序列化。这带来三条硬约束：lambda、闭包、局部函数**不可提交**（不可 pickle）；大对象传输很贵；子进程里的修改不会回到父进程。

Windows 与 macOS 默认用 `spawn` 启动方式（Linux 3.14 起也改为默认 `spawn`），子进程会**重新导入主模块**，所以入口必须加守卫：

```python
# 片段：Windows 上进程池必须这么写
import concurrent.futures as cf

def cpu_task(n):                    # 必须是模块顶层函数，才能被 pickle
    return sum(i * i for i in range(n))

if __name__ == "__main__":           # spawn 会重新 import 本模块
    with cf.ProcessPoolExecutor() as ex:
        print(list(ex.map(cpu_task, range(100))))
```

漏掉这个守卫的典型症状是 `RuntimeError: An attempt has been made to start a new process before the current process has finished its bootstrapping phase`，或者子进程无限递归地创建子进程把机器打满。

进程间通信优先用 `multiprocessing.Queue` 或 `Pool`，需要共享可变状态时用 `Manager().dict()`/`list()`——但要知道它是代理对象，每次读写都要走 IPC，比本地对象慢几个数量级。

## 22.7 `asyncio`：单线程里的并发

`async def` 定义协程函数，调用它只得到协程对象（不执行），必须交给事件循环：`asyncio.run(main())`。`await` 是唯一的切换点——**没写 `await` 就没有并发**。

```pycon
>>> import asyncio
>>> async def hello(n):
...     print("开始", n)
...     await asyncio.sleep(0)      # 让出控制权
...     print("结束", n)
...     return n
...
>>> async def main():
...     return await asyncio.gather(hello(1), hello(2))
...
>>> asyncio.run(main())
开始 1
开始 2
结束 1
结束 2
[1, 2]
```

输出顺序不是巧合：`gather` 按传入顺序把两个协程包装成 `Task`，各自跑到第一个 `await` 让出，再依次恢复。**这就是协程并发的全部机制**——没有线程、没有锁、没有上下文切换开销，只有「谁先让出」。

代价是：**任何一处同步阻塞都会卡死整个事件循环**。`time.sleep(1)`、`requests.get()`、`open().read()` 全都会停住所有协程。要么换异步库（`aiohttp`、`httpx`、`aiofiles`），要么把阻塞调用丢进线程池：

```pycon
>>> import asyncio
>>> def blocking(n):
...     return sum(i * i for i in range(n))
...
>>> asyncio.run(asyncio.to_thread(blocking, 10))
285
```

`asyncio.to_thread`（3.9+）就是「一行把同步函数变成可 `await`」。它背后用默认线程池，所以仍然受线程数限制，但足以救活第三方同步库。

四个必会 API：

| API | 版本 | 用途 |
| --- | --- | --- |
| `asyncio.gather(*aws)` | 3.4+ | 并发等待全部；一个抛异常默认会取消其余 |
| `asyncio.TaskGroup()` | 3.11+ | `async with` 块，任一失败则整组取消，比 `gather` 更安全 |
| `asyncio.timeout(s)` | 3.11+ | `async with` 包住一段，超时抛 `TimeoutError` |
| `asyncio.wait_for(coro, s)` | 3.4+ | 单个协程超时，超时抛 `TimeoutError` |

```python
# 示例：examples/ch22_03_asyncio.py
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
```

```text
A 开始
B 开始
A 结束
B 结束
gather 返回值: ['AA', 'BB']
to_thread 把阻塞调用丢进线程: 285
5 个 0.05s 并发，用时 < 0.15s: True
超时类型: TimeoutError
取消后状态: True | 异常类型: CancelledError
asyncio.run 返回: done
```

取消是协作式的：`task.cancel()` 只是往任务里塞一个 `CancelledError`，协程得跑到下一个 `await` 才会真正退出。所以**别在 `except Exception` 里把 `CancelledError` 吞掉**（3.8+ 它继承自 `BaseException`，正常写法不会误捕），否则取消请求会被吃掉，`asyncio.run` 退出时卡住。

## 22.8 怎么选：30 秒决策

1. 任务是**等网络/磁盘**吗？→ `asyncio`（如果库支持）或 `threading`（库是同步的）。
2. 任务是**算**，且单次超过几十毫秒、数据量大？→ `multiprocessing`（注意 pickle 成本）。
3. 两者都有？→ 外层 `asyncio`，CPU 部分丢 `ProcessPoolExecutor`，阻塞库丢 `to_thread`。
4. 只跑几个任务、几秒钟？→ **先写同步版**。并发的复杂度只有在「确实慢」时才值得付。

## 22.9 五个反模式

| 反模式 | 后果 | 正确做法 |
| --- | --- | --- |
| 在 `async def` 里调 `time.sleep`/`requests` | 整个事件循环停住，并发归零 | `await asyncio.sleep`，或用 `to_thread` |
| 用线程池跑 CPU 密集 | GIL 打架，比单线程还慢 | 换 `ProcessPoolExecutor` |
| 多线程写同一个文件 | 内容交错、编码错乱 | 单写线程 + `queue.Queue` |
| 线程里 `print` 拼输出 | 行与行交错，日志乱序 | 汇总到主线程打印，或用 `logging` |
| 不带超时的 `get()`/`join()` | 一处卡住全进程吊死 | 所有阻塞调用都带 `timeout` |

## 22.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 全局锁 | 有 GIL，线程不能同时跑字节码 | 无，真并行 |
| 线程创建 | `threading.Thread(target=f)` | `std::thread t(f)`，必须 `join` 或 `detach` |
| 互斥 | `threading.Lock`（无 RAII） | `std::mutex` + `std::lock_guard` |
| 原子操作 | 几乎没有（`+=` 不原子） | `std::atomic<int>` 硬件级原子 |
| 条件变量 | `threading.Condition` | `std::condition_variable` |
| 进程 | `multiprocessing` 是标准库一等公民 | 无标准进程 API，靠 `fork`/平台调用 |
| 协程 | `async/await` 语言级 + 标准库事件循环 | C++20 协程是**语言机制**，无标准运行时 |
| 数据传递 | pickle 自动序列化 | 手写共享内存/管道/序列化 |
| 取消 | `task.cancel()` 协作式 | 无标准机制，靠标志位 |
| 调试 | 竞态难复现，靠 `logging` + 压力循环 | 同样难，但可用 TSAN 检测 |

一句话：C++ 的并发是**硬件并行**（多核同时跑），Python 的并发是**等待重叠**（一个核上把等待叠起来，或多进程占多核）。把 C++ 的多线程直觉搬到 Python 上，最常见的错误就是「开 8 个线程算 8 份 CPU 任务」。

## 22.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 多线程算素数比单线程还慢 | GIL 让 CPU 密集无收益 | 换 `ProcessPoolExecutor` |
| 计数结果少于预期（如 2997） | `+=` 非原子，丢更新 | `with lock:` 包住读改写 |
| 子线程没跑完程序就退出了 | 主线程没 `join` | 全部 `join()`，或 `with ThreadPoolExecutor` |
| 线程里抛异常，主线程毫无察觉 | 异常留在子线程 | 用 `Future.result()` 取回，别 `try: pass` |
| `ProcessPoolExecutor` 提交 lambda 报 `PicklingError` | 进程要 pickle，lambda 不可 | 换成模块顶层函数 |
| Windows 上进程池报 bootstrapping 错误 | 缺 `if __name__ == "__main__":` | 补守卫 |
| 协程里 `time.sleep` 导致全体变慢 | 阻塞事件循环 | `await asyncio.sleep` 或 `to_thread` |
| `await` 忘了写，返回 `<coroutine object>` | 协程对象没被调度 | 补 `await`，或用 `create_task` |
| `asyncio.run` 里再调 `asyncio.run` | 一个线程只能有一个事件循环 | 内层改 `await`，或用 `nest_asyncio`（不推荐） |
| 超时后进程仍不退出 | 线程/任务没被取消，仍阻塞在 IO | 所有等待带 timeout，取消后 `await` 一次 |
| 用 `Queue` 但消费者永不退出 | 没有哨兵/结束信号 | 放 `None` 哨兵，或 `get(timeout=)` + 标志位 |

## 22.c 练习

**基础 1**：开 4 个线程，每个把 `1..25` 的数平方追加进共享列表，最后排序输出全部 100 个数并与单线程结果比对。

验收：用 `lock` 保护追加，两次结果完全相等；总数为 100 且无重复。

**基础 2**：用 `ThreadPoolExecutor(max_workers=4)` 并发下载 3 个 URL（可用 `urllib.request`），返回 `(url, 字节数)` 列表；任一失败不影响其它。

验收：返回列表长度 3；把其中一个 URL 改成非法域名时，捕获 `URLError` 且其余成功。

**基础 3**：写两个协程，各 `await asyncio.sleep(0.1)` 三次并记录时间戳间隔，用 `gather` 并发执行，总耗时应在 0.1s 量级而不是 0.6s。

验收：`print` 出的总耗时 `< 0.3`（要求环境稳定）；两次输出的顺序与实际耗时一致。

**变式**：把基础 1 改成 `ProcessPoolExecutor` 版本，确认结果相同；再用 `if __name__ == "__main__":` 守卫验证 Windows 下不报 bootstrapping 错误。

验收：两个版本结果一致；去掉守卫后能复现 `RuntimeError: ... bootstrapping phase`。

**挑战**：实现一个有界工作队列：3 个生产者各生产 20 个任务（带自增 id），4 个消费者处理（每个任务 `sleep` 随机毫秒并记录 `(id, 消费者名)`），全部完成后断言「每个 id 恰好被处理一次」。

验收：断言 `sorted(ids) == list(range(60))`；`q.unfinished_tasks == 0`；程序在 5 秒内退出。

## 22.d 小结

1. GIL 决定了分工：等 IO 用线程或协程，算 CPU 用进程；线程数看并发请求数，进程数看核数。
2. 线程三件套是 `join`、`with lock:`、`queue.Queue`；进程三件套是 `__main__` 守卫、可 pickle 的顶层函数、显式传参。
3. 协程的全部机制是「`await` 处让出」，所以一处同步阻塞就毁掉全部并发——要么异步库，要么 `to_thread`。

下一章从代码转向工程：虚拟环境怎么隔离依赖，`pip` 与 `requirements.txt`/`pyproject.toml` 该怎么管，以及为什么「在我机器上能跑」是一个环境问题。
