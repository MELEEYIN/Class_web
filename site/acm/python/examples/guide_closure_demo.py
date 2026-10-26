# 示例：examples/guide_closure_demo.py


def make_counter():
    count = 0

    def step():
        nonlocal count
        count += 1
        return count

    return step


c = make_counter()
print(c(), c())