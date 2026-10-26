"""ch01_02_main_guard.py —— 被直接运行 vs 被导入，同一个文件两种身份"""


def main():
    print("main() 开始工作")
    print("这里的 __name__ =", __name__)


if __name__ == "__main__":
    main()