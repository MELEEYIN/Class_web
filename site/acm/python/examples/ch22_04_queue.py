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