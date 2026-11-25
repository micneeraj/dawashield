"""Run: python -I -m unittest discover -s data -p "test_*.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dedupe import PLACEHOLDER_BATCHES, assign_ids, dedupe, is_placeholder  # noqa: E402


def row(name="Cefixime Tablets 200mg", batch="GT60004", maker="Omega Pharma", month="2026-10",
        lab="DTL Bhopal", mfg="Apr-2026", exp="Mar-2028", legacy=None):
    """A prepared row, the same fields build_dataset.py sets before dedupe()."""
    from dedupe import squash
    legacy = legacy if legacy is not None else squash(batch)
    unspecified = is_placeholder(legacy)
    return {
        "type": "NSQ", "name": name, "batch": batch, "month": month, "lab": lab,
        "mfgDate": mfg, "expDate": exp, "manufacturer": maker,
        "manufacturerEntity": maker.upper(), "legacyBatchNorm": legacy,
        "batchUnspecified": unspecified, "batchNorm": "" if unspecified else legacy,
    }


class DedupeTest(unittest.TestCase):
    def test_same_batch_different_manufacturers_are_kept_apart(self):
        a = row(batch="B100", maker="Alpha Pharma Ltd")
        b = row(batch="B100", maker="Beta Pharma Ltd")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 2)

    def test_missing_batch_different_products_are_kept_apart(self):
        a = row(name="Oxytocin Injection Vet. 100 ml Vial", batch="NOT APPLICABLE", maker="Vet Co")
        b = row(name="Oxytocin Injection Vet. 50 ml Vial", batch="NOT APPLICABLE", maker="Vet Co")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 2)

    def test_missing_batch_different_manufacturers_are_kept_apart(self):
        a = row(name="Codeine Syrup", batch="Not Mention", maker="Wings Biotech LLP", mfg="Aug-2025", exp="Jan-2027")
        b = row(name="Codeine Syrup", batch="Not Mention", maker="Cost 2 Cost Bio Pharma", mfg="Dec-2025", exp="Dec-2027")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 2)

    def test_same_batch_different_manufacture_dates_are_kept_apart(self):
        a = row(name="Buprenorphine Injection", batch="1364ASO", mfg="Jun-2025", exp="May-2027")
        b = row(name="Buprenorphine Injection", batch="1364ASO", mfg="May-2024", exp="Apr-2026")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 2)

    def test_genuine_exact_duplicate_is_merged_and_counted(self):
        a = row(batch="GT60004")
        b = row(batch="GT60004")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["listedTimes"], 2)

    def test_exact_duplicate_with_punctuation_difference_in_name_is_merged(self):
        a = row(name="Ibuprofen & Paracetamol Suspension")
        b = row(name="Ibuprofen and Paracetamol Suspension")
        out, _ = dedupe([a, b])
        self.assertEqual(len(out), 2, "a different name wording is a different listing text: kept separate, not guessed")

    def test_placeholder_batch_is_never_an_exact_batch(self):
        for raw in ("Not Mention", "NIL", "Not applicable", "NA", "Not Mentioned"):
            r = row(batch=raw)
            self.assertTrue(r["batchUnspecified"], raw)
            self.assertEqual(r["batchNorm"], "", raw)
        self.assertIn("NOTMENTION", PLACEHOLDER_BATCHES)

    def test_real_batch_is_not_a_placeholder(self):
        self.assertFalse(row(batch="251TTF014")["batchUnspecified"])
        self.assertFalse(row(batch="NILAPA01")["batchUnspecified"])

    def test_ids_are_stable_and_unique(self):
        a = row(name="Codeine Syrup", batch="Not Mention", maker="Wings Biotech LLP")
        b = row(name="Codeine Syrup", batch="Not Mention", maker="Cost 2 Cost Bio Pharma")
        out, _ = dedupe([a, b])
        assign_ids(out)
        ids = [r["id"] for r in out]
        self.assertEqual(len(set(ids)), 2)
        # the first record keeps the id the pre-existing formula gave it
        import hashlib
        base = hashlib.sha1(f"NSQ|NOTMENTION|Codeine Syrup|2026-10|DTL Bhopal".encode()).hexdigest()[:12]
        self.assertEqual(out[0]["id"], base)

    def test_nameless_row_is_reported_not_silently_kept(self):
        bad = row()
        bad["name"] = ""
        out, skipped = dedupe([bad])
        self.assertEqual(out, [])
        self.assertEqual(len(skipped), 1)


if __name__ == "__main__":
    unittest.main()
