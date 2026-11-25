"""Deduplication and record identity for the CDSCO pipeline.

Rules (see docs/RECONCILIATION.md):
- Only an exact duplicate listing is merged. A listing is the same record when the
  product name (full, not truncated), manufacturer entity, manufacture and expiry dates,
  batch, alert month and reporting lab all match. Addresses and punctuation may differ.
- Two products, two manufacturers, or two lots with different dates are never merged,
  even when the batch text is identical or missing.
- A placeholder batch ("Not Mention", "NIL", "Not applicable", ...) is not a batch number.
  Such records are kept, marked batchUnspecified, and get an empty batchNorm so that they
  can never match an exact batch.
- Record ids stay as they were before this rule set (so nothing is renumbered). If two
  distinct records would share an id, the later one gets a "-2", "-3" suffix.
Pure functions, unit-tested in data/test_dedupe.py.
"""
from __future__ import annotations

import hashlib
import re

# Normalised batch values (letters and digits only) that mean "no batch number was printed".
PLACEHOLDER_BATCHES = {
    "NOTMENTION", "NOTMENTIONED", "NOTAPPLICABLE", "NIL", "NA", "NONE", "NOTSTATED",
    "NOTGIVEN", "NOTAVAILABLE", "UNKNOWN", "NOBATCH", "NOTKNOWN", "NOTSPECIFIED",
}


def squash(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def is_placeholder(batch_norm: str) -> bool:
    return (not batch_norm) or batch_norm in PLACEHOLDER_BATCHES


def identity_key(r: dict) -> tuple:
    """What makes two listings the same record. Full name and dates, not a prefix."""
    name = squash(re.sub(r"\(N/?A\)", "", r.get("name") or ""))
    maker = r.get("manufacturerEntity") or squash(r.get("manufacturer") or "")
    return (r["type"], r["batchNorm"], name, maker, r.get("mfgDate", ""), r.get("expDate", ""), r["month"], r.get("lab", ""))


def dedupe(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (kept, skipped). Each prepared row needs legacyBatchNorm, batchNorm,
    batchUnspecified, manufacturerEntity. Duplicates raise listedTimes on the first row."""
    seen: dict[tuple, dict] = {}
    out: list[dict] = []
    skipped: list[dict] = []
    for r in records:
        if not r.get("name"):
            skipped.append(r)
            continue
        key = identity_key(r)
        if key in seen:
            seen[key]["listedTimes"] = seen[key].get("listedTimes", 1) + 1
            continue
        seen[key] = r
        out.append(r)
    return out, skipped


def assign_ids(rows: list[dict]) -> None:
    """Stable ids: the pre-existing hash formula, with a suffix only on a real collision."""
    used: set[str] = set()
    for r in rows:
        base = hashlib.sha1(f"{r['type']}|{r['legacyBatchNorm']}|{r['name']}|{r['month']}|{r['lab']}".encode()).hexdigest()[:12]
        rid, n = base, 1
        while rid in used:
            n += 1
            rid = f"{base}-{n}"
        used.add(rid)
        r["id"] = rid
