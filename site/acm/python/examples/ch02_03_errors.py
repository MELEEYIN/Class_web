"""ch02_03_errors.py —— 缩进错误的四种真身"""

cases = {
    "缺少缩进": "if True:\nprint(1)",
    "多余缩进": "print(1)\n    print(2)",
    "缩进对不上": "if True:\n    print(1)\n  print(2)",
    "Tab 与空格混用": "if True:\n\tprint(1)\n        print(2)",
}

for name, src in cases.items():
    try:
        compile(src, "<demo>", "exec")
        print(f"{name}: 通过了（这是意外）")
    except (IndentationError, TabError) as e:
        print(f"{name}: {type(e).__name__}: {e.msg}")