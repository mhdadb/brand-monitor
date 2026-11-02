import unittest

from monitor.matcher import find_match

TERMS = ["بهزاد ایکام", "بهزاد آذریان", "behzadecom", "behzad azaryan"]


class FindMatchTest(unittest.TestCase):
    def test_exact(self):
        self.assertEqual(find_match("دوره بهزاد ایکام رو کسی گذرونده؟", TERMS), "بهزاد ایکام")

    def test_zwnj_and_arabic_letters(self):
        self.assertEqual(find_match("نظرتون درباره بهزاد‌ايكام چیه", TERMS), "بهزاد ایکام")

    def test_typos(self):
        self.assertEqual(find_match("بهزاد اذریان دراپ شیپینگ", TERMS), "بهزاد آذریان")
        self.assertEqual(find_match("site behzadicom is", TERMS), "behzadecom")
        self.assertEqual(find_match("Behzad Azarian course", TERMS), "behzad azaryan")

    def test_unrelated(self):
        self.assertIsNone(find_match("همایون بهزادی اسطوره فوتبال", TERMS))
        self.assertIsNone(find_match("آموزش دراپ شیپینگ رایگان", TERMS))


if __name__ == "__main__":
    unittest.main()
