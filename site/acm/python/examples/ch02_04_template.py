"""ch02_04_template.py —— 一个可以直接抄去用的最小程序模板"""
import sys


def solve(a: int, b: int) -> int:
    """返回两个整数之和。"""
    return a + b


def main() -> None:
    data = sys.stdin.read().split()
    if not data:                    # 没有输入时走演示分支，方便直接运行
        print("没有输入，走演示分支")
        print(solve(1, 2))
        return
    a, b = int(data[0]), int(data[1])
    print(solve(a, b))


if __name__ == "__main__":
    main()