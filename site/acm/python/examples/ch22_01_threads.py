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