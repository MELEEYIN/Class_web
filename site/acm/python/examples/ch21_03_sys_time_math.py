import math
import os
import sys
from datetime import date, datetime, timedelta, timezone

print(sys.version_info[:2] >= (3, 10), sys.platform, sys.getrecursionlimit())
print(os.path.join("data", "out.txt") == "data" + os.sep + "out.txt")
print(os.path.basename("/a/b/c.txt"), os.path.splitext("c.txt"))

d = date(2024, 2, 29)
print(d, d.weekday(), d.isoformat())
print((date(2024, 3, 1) - date(2024, 2, 1)).days)
print(date(2024, 1, 31) + timedelta(days=1))

dt = datetime(2024, 1, 1, 9, 30)
print(dt + timedelta(hours=2, minutes=45))
print(dt.strftime("%Y/%m/%d %H:%M:%S"))
print(datetime.strptime("2024-03-05 08:00", "%Y-%m-%d %H:%M"))

utc = datetime(2024, 1, 1, tzinfo=timezone.utc)
print(utc.astimezone(timezone(timedelta(hours=8))).isoformat())
print(datetime(2024, 1, 1) == datetime(2024, 1, 1, tzinfo=timezone.utc))

print(math.isclose(0.1 + 0.2, 0.3), 0.1 + 0.2 == 0.3)
print(math.gcd(12, 18), math.lcm(4, 6), math.factorial(5))
print(math.comb(5, 2), math.perm(5, 2))
print(math.floor(-2.5), math.ceil(-2.5), math.trunc(-2.5))
print(math.inf > 1e308, math.isnan(float("nan")), float("nan") == float("nan"))
print(math.hypot(3, 4), math.sqrt(16), math.log2(8), math.log(100, 10))
print(round(math.pi, 4), round(math.e, 4))