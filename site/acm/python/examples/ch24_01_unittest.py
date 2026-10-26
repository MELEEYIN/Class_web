import io
import unittest


def safe_div(a, b):
    if b == 0:
        raise ValueError("除数不能为 0")
    return a / b


class TestSafeDiv(unittest.TestCase):
    def test_normal(self):
        self.assertEqual(safe_div(6, 3), 2)

    def test_float(self):
        self.assertAlmostEqual(safe_div(1, 3), 0.3333, places=4)

    def test_zero(self):
        with self.assertRaises(ValueError) as ctx:
            safe_div(1, 0)
        self.assertEqual(str(ctx.exception), "除数不能为 0")

    def test_many_cases(self):
        for a, b in [(1, 1), (4, 2), (9, 3)]:
            with self.subTest(a=a, b=b):
                self.assertEqual(safe_div(a * b, b), a)

    @unittest.expectedFailure
    def test_known_bug(self):
        self.assertEqual(safe_div(1, 3), 0.33)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestSafeDiv)
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer, verbosity=2).run(suite)

print("用例数:", result.testsRun)
print("失败:", len(result.failures), "| 错误:", len(result.errors))
print("预期失败:", len(result.expectedFailures), "| 跳过:", len(result.skipped))
print("整体通过:", result.wasSuccessful())
for case, _ in result.expectedFailures:
    print("被标记为预期失败的方法:", case._testMethodName)