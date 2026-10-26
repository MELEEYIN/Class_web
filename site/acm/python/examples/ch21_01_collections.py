from collections import ChainMap, Counter, defaultdict, deque, namedtuple

words = "the cat the dog the bird cat".split()
c = Counter(words)
print(c["the"], c["fish"])          # 缺失键返回 0，不抛 KeyError
print(c.most_common(2))
print(sorted(c))

dd = defaultdict(list)              # 默认值由工厂函数现造，不是共享同一个
for tag, name in [("py", "a"), ("py", "b"), ("cpp", "c")]:
    dd[tag].append(name)
print(dict(dd))
print(dd["缺失"])                   # 读一下就插入了一个空 list
print(sorted(dd))

dq = deque([1, 2, 3], maxlen=3)     # 满了从另一头挤掉
dq.append(4)
dq.appendleft(0)
print(dq)

Point = namedtuple("Point", "x y")
p = Point(1, 2)
print(p, p.x, p[1], p._asdict())
print(p._replace(y=9))

base = {"a": 1, "b": 2}
override = {"b": 20, "c": 30}
cm = ChainMap(override, base)       # 查的时候先 override 再 base
print(cm["b"], cm["a"])
print(dict(cm))