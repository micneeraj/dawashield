"""Print candidate records next to the raw text of the official monthly PDF
that contains their batch number, for hand verification.

Usage: python -I data/verify_helper.py [N]
Writes nothing; the human reviewer writes data/verified_records.csv.
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 70

recs = json.loads((ROOT / "public/data/nsq.json").read_text(encoding="utf-8"))
cands = [r for r in recs if r.get("pdfMatch")]
# Spread across months and both types
by_month = {}
for r in cands:
    by_month.setdefault((r["month"], r["type"]), []).append(r)
picked = []
while len(picked) < N and any(by_month.values()):
    for k in sorted(by_month):
        if by_month[k]:
            picked.append(by_month[k].pop(0))

texts = {}
for p in sorted((ROOT / "data/raw/pdf").glob("*.pdf")):
    try:
        with pdfplumber.open(p) as pdf:
            texts[p.name] = [ln for pg in pdf.pages for ln in (pg.extract_text() or "").splitlines()]
    except Exception:
        pass

sq = lambda s: re.sub(r"[^A-Z0-9]", "", s.upper())
for r in picked[:N]:
    print("=" * 100)
    print(f"{r['type']} | {r['month']} | batch={r['batch']} | norm={r['batchNorm']}")
    print(f"  name: {r['name']} | brand: {r.get('brand','')}")
    print(f"  mfr : {r['manufacturerName']} | entity={r['manufacturerEntity']}")
    print(f"  reason: {r['reason'][:140]}")
    print(f"  lab: {r['lab']} | pdf: {r.get('pdfUrl','')[-70:]}")
    for name, lines in texts.items():
        if not name.startswith(r["month"]):
            continue
        for i, ln in enumerate(lines):
            if r["batchNorm"] and r["batchNorm"] in sq(ln):
                ctx = " / ".join(lines[max(0, i - 2): i + 3])
                print(f"  PDF[{name[:40]}]: {ctx[:400]}")
                break
