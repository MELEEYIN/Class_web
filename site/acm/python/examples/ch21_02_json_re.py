import datetime
import json
import re

data = {"name": "小明", "age": 18, "tags": ["py", "竞赛"], "vip": False}
s = json.dumps(data, ensure_ascii=False, sort_keys=True)
print(s)
print(json.dumps(data, indent=2, ensure_ascii=False).splitlines()[1])

back = json.loads(s)
print(back == data, back["tags"][1])
print(json.dumps("中文"))                       # 默认全是 \u 转义
print(json.loads('{"a": [1, 2.5, "x"], "b": null}'))

try:
    json.loads('{"a": 1,}')
except json.JSONDecodeError as e:
    print(type(e).__name__, "|", e.msg, "| 位置", e.pos)

try:
    json.dumps({"t": datetime.date(2024, 1, 1)})
except TypeError as e:
    print(type(e).__name__, "|", e)

print(re.findall(r"\d+", "a1b22c333"))
print(re.split(r",\s*", "a, b,c"))
print(re.sub(r"(\w+)@(\w+)\.com", r"\2:\1", "tom@mail.com"))

m = re.match(r"(?P<y>\d{4})-(?P<m>\d{2})", "2024-03")
print(m.groupdict(), m.group(2), m.groups())

print(re.match(r"<.*>", "<a><b>").group(), re.match(r"<.*?>", "<a><b>").group())
print(re.findall(r"[a-z]+", "Ab Cd", re.IGNORECASE))

for mm in re.finditer(r"\d+", "x10y200"):
    print(mm.group(), mm.span())

pat = re.compile(r"^\d{3}-\d{4}$")
print(bool(pat.fullmatch("123-4567")), bool(pat.fullmatch("12-4567")))
print(re.sub(r"\s+", " ", "  a   b  ").strip())