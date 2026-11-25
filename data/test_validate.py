"""Run: python -I -m unittest discover -s data -p "test_*.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import COVERAGE_START, added_records, changelog_entry, in_coverage, removed_ids, unexplained_removals, validate  # noqa: E402


def rec(i, month="2026-09", **kw):
    r = {"id": f"id{i}", "type": "NSQ", "name": f"Med {i}", "batch": f"B{i}", "batchNorm": f"B{i}", "month": month,
         "sourceUrl": "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug", "manufacturerName": "X Ltd"}
    r.update(kw)
    return r


class ValidateTest(unittest.TestCase):
    def test_ok(self):
        prev = [rec(i) for i in range(100)]
        new = prev + [rec(100, "2026-10")]
        self.assertEqual(validate(new, prev), [])

    def test_empty_is_failure(self):
        self.assertTrue(validate([], [rec(1)]))

    def test_sharp_drop_is_failure(self):
        prev = [rec(i) for i in range(100)]
        self.assertTrue(any("dropped" in e for e in validate(prev[:50], prev)))

    def test_missing_fields_is_failure(self):
        new = [rec(i) for i in range(10)] + [rec(i, batch="") for i in range(10, 20)]
        self.assertTrue(any("required" in e for e in validate(new, None)))

    def test_month_backwards_is_failure(self):
        prev = [rec(1, "2026-09")]
        self.assertTrue(any("backwards" in e for e in validate([rec(1, "2026-08")], prev)))

    def test_diff_and_changelog(self):
        prev = [rec(1), rec(2)]
        new = [rec(2), rec(3, "2026-10")]
        add = added_records(prev, new)
        self.assertEqual([r["id"] for r in add], ["id3"])
        self.assertEqual(removed_ids(prev, new), ["id1"])
        text = changelog_entry("2026-11-21", add, ["id1"], "2026-10")
        self.assertIn("Added: 1", text)
        self.assertIn("batch B3", text)


class HistoricalRetentionTest(unittest.TestCase):
    """Importing a new monthly list must never remove valid historical records."""

    def test_coverage_is_fixed_start_october_2024(self):
        self.assertEqual(COVERAGE_START, "2024-10")
        self.assertTrue(in_coverage("2024-10"))
        self.assertFalse(in_coverage("2024-09"))

    def test_new_month_keeps_all_history(self):
        old_months = [rec(i, "2024-10") for i in range(20)] + [rec(100 + i, "2026-09") for i in range(20)]
        new_month = [rec(200 + i, "2026-10") for i in range(20)]
        new = old_months + new_month
        self.assertEqual(validate(new, old_months), [])
        self.assertEqual(unexplained_removals(new, old_months, set()), [])
        self.assertEqual(removed_ids(old_months, new), [])

    def test_removing_history_without_correction_is_blocked(self):
        prev = [rec(i, "2024-10") for i in range(20)] + [rec(100 + i, "2026-09") for i in range(20)]
        new = prev[1:]  # one historical record silently gone
        errors = validate(new, prev)
        self.assertTrue(any("without a documented correction" in e for e in errors))

    def test_documented_correction_allows_removal(self):
        prev = [rec(i, "2024-10") for i in range(20)] + [rec(100 + i, "2026-09") for i in range(20)]
        new = prev[1:]
        self.assertEqual(validate(new, prev, {prev[0]["id"]}), [])


if __name__ == "__main__":
    unittest.main()
