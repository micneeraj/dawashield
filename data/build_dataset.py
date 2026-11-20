"""Build DawaShield's medicine-alert dataset from official CDSCO sources only.

Sources (both run by CDSCO, Government of India):
  1. CDSCO public NSQ/spurious alert portal - the "new link" announced in the
     DCGI notice of 28 Aug 2025:
       https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug
     It serves the monthly alerts as structured rows.
  2. The monthly alert PDFs listed on
       https://cdsco.gov.in/opencms/opencms/en/Notifications/Alerts/
     These are saved to data/raw/ and their text is used to cross-check rows.

Nothing is invented. A month that fails to download is listed in meta.json
under "failed". Run:  python -I data/build_dataset.py   (from the app folder)
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
VERIFIED_CSV = ROOT / "data" / "verified_records.csv"
CHANGELOG = ROOT / "data" / "CHANGELOG.md"
RUN_LOG = ROOT / "data" / "pipeline_log.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import added_records, changelog_entry, log_run, prepend_changelog, removed_ids, validate  # noqa: E402

PORTAL = "https://cdscoonline.gov.in/CDSCO"
PORTAL_PAGE = PORTAL + "/viewPublicNSQDrug"
SITE = "https://cdsco.gov.in"
ALERT_PAGES = [
    SITE + "/opencms/opencms/en/Notifications/Alerts/",
    SITE + "/opencms/opencms/en/Notifications/nsq-drugs/",
]
UA = {"User-Agent": "Mozilla/5.0 (DawaShield dataset builder; open-source)"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
WINDOW = 24  # months back from the latest published month


OFFLINE = "--offline" in sys.argv  # rebuild from data/raw only


def get(url: str, tries: int = 3, timeout: int = 120) -> bytes:
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network errors are reported, never hidden
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def decode(b: bytes) -> str:
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("cp1252", errors="replace")


def clean(s) -> str:
    s = "" if s is None else str(s)
    s = html.unescape(s).replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip(" ,;")


# ---------- normalisation (mirrors src/lib/normalize.ts) ----------
BATCH_PREFIX = re.compile(r"^\s*(BATCH\s*NO|BATCH\s*NUMBER|B\s*\.?\s*NO|BATCH|LOT\s*NO|LOT)\s*[.:#]?\s*")


def norm_batch(raw: str) -> str:
    s = clean(raw).upper()
    s = BATCH_PREFIX.sub("", s)
    return re.sub(r"[^A-Z0-9]", "", s)


LEGAL = r"\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|INDIA|THE)\b"


def manufacturer_name(raw: str) -> str:
    """Company name as stated: text before the first comma / address part."""
    s = clean(raw)
    s = re.sub(r"^(MFG\.?\s*BY|MFD\.?\s*BY|MANUFACTURED\s*BY|MKTD\.?\s*BY)\s*[:.\-]?\s*", "", s, flags=re.I)
    s = re.sub(r"^(M\s*/\s*S\.?|MESSRS\.?)\s*", "", s, flags=re.I)
    # Cut at the address: comma, unit/plot words, or the first token that starts a number ("38", "D 152").
    s = re.split(r",|\(Unit|\bUnit[- ]|\bPlot\b|\bSurvey\b|\bVillage\b|\bVill\b|\bKhasra\b|\s(?=[A-Z]?[- ]?\d)",
                 s, maxsplit=1, flags=re.I)[0]
    m = re.match(r"(.*?(?:LTD|LIMITED|LLP)\.?)", s, flags=re.I)
    if m:
        s = m.group(1)
    return clean(s)


def manufacturer_entity(raw: str) -> str:
    """Exact company entity key. 'Sresan Pharmaceuticals' != 'Sresan Pharma'.
    Only legal suffixes and punctuation are dropped - no fuzzy merging."""
    s = manufacturer_name(raw).upper()
    if not s or "INVESTIGATION" in s or s in {"NA", "N/A", "NOT KNOWN", "UNKNOWN"}:
        return ""
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(LEGAL, " ", s)
    return re.sub(r"\s+", " ", s).strip()


def month_key(m: str) -> str:
    """'SEP-2026' -> '2026-09'."""
    mm = re.match(r"([A-Za-z]{3})[A-Za-z]*[- ]?(\d{4})", clean(m))
    if not mm:
        return ""
    return f"{mm.group(2)}-{MONTHS.index(mm.group(1).title()) + 1:02d}"


# ---------- portal ----------
def portal_json(path: str, params: dict) -> object:
    url = f"{PORTAL}/{path}?{urllib.parse.urlencode(params)}"
    return json.loads(decode(get(url)))


def portal_months(tab: str) -> list[str]:
    if OFFLINE:
        return [f.stem.split("_", 1)[1] for f in (RAW / "portal").glob(f"{tab}_*.json")]
    out = []
    for y in portal_json("reportingYears", {"tab": tab}):
        for m in portal_json("publicReportingMonths", {"year": y, "tab": tab}):
            out.append(f"{m}-{y}")
    return out


def fetch_portal(window_months: list[str], failed: list) -> list[dict]:
    rows = []
    for tab, path in (("nsq", "filteredNsqDrugTable"), ("spurious", "filteredSpuriousDrugTable")):
        available = set(portal_months(tab))
        for m in window_months:
            if m not in available:
                continue
            cache = RAW / "portal" / f"{tab}_{m}.json"
            try:
                if OFFLINE and cache.exists():
                    data = json.loads(cache.read_text(encoding="utf-8"))
                else:
                    data = portal_json(path, {"month": m, "source": "All", "tab": tab})
            except Exception as e:
                failed.append({"month": m, "type": tab.upper(), "error": str(e)[:200]})
                continue
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            for r in data.get("aaData", []):
                rows.append(from_portal(r, tab, m))
            print(f"  portal {tab:8s} {m}: {len(data.get('aaData', []))}")
    return rows


def from_portal(r: dict, tab: str, m: str) -> dict:
    spurious = tab == "spurious"
    name = clean(r.get("product_name_from_dtl") if spurious else r.get("str_product_name"))
    made_by = clean(r.get("str_spurious_manufactured_by") or r.get("str_manufactured_by")) if spurious else clean(r.get("str_manufactured_by"))
    brand = clean(r.get("str_brand_name")).strip("()")
    if brand.upper() in {"NA", "N/A", "-", "NIL", "NONE"}:
        brand = ""
    rec = {
        "type": "SPURIOUS" if spurious else "NSQ",
        "name": name,
        "brand": brand,
        "batch": clean(r.get("str_batch_no")),
        "manufacturer": made_by,
        "manufacturerName": manufacturer_name(made_by),
        "mfgDate": clean(r.get("dt_manufacturing_date")),
        "expDate": clean(r.get("dt_expiry_date")),
        "reason": clean(r.get("str_nsq_result")),
        "reportingSource": clean(r.get("str_reporting_source")),
        "lab": clean(r.get("str_reported_by_lab_or_state")),
        "month": month_key(r.get("dt_reporting_month_year") or m),
        "sourceUrl": PORTAL_PAGE,
        "sourceLabel": "CDSCO NSQ alert portal",
    }
    if spurious:
        rec["remarks"] = clean(r.get("str_nsq_remarks"))
        rec["firmReply"] = clean(r.get("str_firm_reply"))
        label_name = clean(r.get("str_spurious_manufacturer_name"))
        if label_name and label_name.lower() != made_by.lower():
            rec["labelManufacturer"] = label_name
    return rec


# ---------- PDFs ----------
def list_pdfs() -> list[dict]:
    seen, out = set(), []
    for page in ALERT_PAGES:
        try:
            t = decode(get(page))
        except Exception as e:
            print("  could not read", page, e)
            continue
        for row in re.findall(r"<tr.*?</tr>", t, re.S):
            title = clean(re.sub("<[^>]+>", " ", row))
            link = re.search(r"(/opencms/opencms/system/modules/CDSCO\.WEB/elements/download_file_division\.jsp\?num_id=[^\"']+)", row)
            if not link or not re.search(r"NSQ|Not Of Standard|Spurious|Drug Alert", title, re.I):
                continue
            mm = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-–]*(20\d\d)", title, re.I)
            if not mm or link.group(1) in seen:
                continue
            seen.add(link.group(1))
            out.append({"title": title, "jsp": SITE + link.group(1),
                        "month": f"{mm.group(2)}-{MONTHS.index(mm.group(1)[:3].title()) + 1:02d}"})
    return out


def download_pdf(item: dict) -> Path | None:
    page = decode(get(item["jsp"]))
    m = re.search(r"src='([^']+\.pdf)'", page, re.I) or re.search(r'src="([^"]+\.pdf)"', page, re.I)
    if not m:
        return None
    url = urllib.parse.urljoin(SITE, urllib.parse.quote(m.group(1), safe="/:%"))
    item["pdfUrl"] = url
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(urllib.parse.unquote(m.group(1))).name)
    dest = RAW / "pdf" / f"{item['month']}_{name}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        dest.write_bytes(get(url))
    return dest


def pdf_text(path: Path) -> str:
    import pdfplumber  # pip install pdfplumber

    parts = []
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            parts.append(p.extract_text() or "")
    return "\n".join(parts)


def pdf_entries(text: str) -> dict[str, list[int]]:
    """Map normalised batch -> serial numbers of the PDF rows that list it."""
    out: dict[str, list[int]] = {}
    for ln in text.splitlines():
        m = re.match(r"\s*(\d{1,4})[.)]\s+(.*)", ln)
        if not m:
            continue
        for tok in re.split(r"\s+", m.group(2)):
            b = norm_batch(tok)
            if len(b) >= 4 and re.search(r"\d", b):
                out.setdefault(b, [])
                if int(m.group(1)) not in out[b]:
                    out[b].append(int(m.group(1)))
    return out


def squash(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


# ---------- main ----------
def keep_last_good(reason: str, detail: dict | None = None) -> int:
    """Source down or parse looks wrong: never overwrite the published data."""
    print("NOT PUBLISHED, keeping last good dataset:", reason)
    log_run(RUN_LOG, "kept-last-good", {"reason": reason[:500], **(detail or {})})
    return 0  # the workflow still commits the log; the app keeps working on the last good data


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        return build()
    except Exception as e:  # source down, network error, format change
        return keep_last_good(f"pipeline error: {type(e).__name__}: {e}")


def build() -> int:
    failed: list = []
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    print("Portal months...")
    all_months = sorted(set(portal_months("nsq")) | set(portal_months("spurious")), key=month_key)
    window = all_months[-WINDOW:]
    print("  window:", window[0], "to", window[-1])
    records = fetch_portal(window, failed)

    print("PDFs...")
    texts: dict[str, list[tuple[str, str]]] = {}
    entries: dict[str, list[tuple[str, dict[str, list[int]]]]] = {}
    pdf_urls: dict[str, str] = {}

    def add_pdf(month: str, url: str, raw: str) -> None:
        texts.setdefault(month, []).append((url, squash(raw)))
        entries.setdefault(month, []).append((url, pdf_entries(raw)))

    if OFFLINE:  # rebuild from the PDFs already on disk (URLs recorded in pdf_urls.json)
        urls = json.loads((RAW / "pdf_urls.json").read_text(encoding="utf-8")) if (RAW / "pdf_urls.json").exists() else {}
        for f in sorted((RAW / "pdf").glob("*.pdf")):
            if f.name in urls and f.name[:7] >= month_key(window[0]):
                txt = pdf_text(f)
                if len(txt.strip()) >= 200:
                    add_pdf(f.name[:7], urls[f.name], txt)
    else:
        for p in [p for p in list_pdfs() if p["month"] >= month_key(window[0])]:
            try:
                path = download_pdf(p)
                if not path:
                    failed.append({"month": p["month"], "type": "PDF", "error": "no PDF link: " + p["title"][:80]})
                    continue
                txt = pdf_text(path)
                if len(txt.strip()) < 200:
                    failed.append({"month": p["month"], "type": "PDF", "error": "no text layer (scanned): " + p["title"][:80]})
                    continue
                add_pdf(p["month"], p["pdfUrl"], txt)
                pdf_urls[path.name] = p["pdfUrl"]
                print(f"  pdf {p['month']} ok  {path.name[:60]}")
            except Exception as e:
                failed.append({"month": p["month"], "type": "PDF", "error": str(e)[:200]})

    if pdf_urls:
        (RAW / "pdf_urls.json").write_text(json.dumps(pdf_urls, indent=1), encoding="utf-8")

    # Clean + dedupe + cross-check against PDF text
    seen: dict[tuple, dict] = {}
    out = []
    for r in records:
        if not r["batch"] or not r["name"]:
            continue
        r["batchNorm"] = norm_batch(r["batch"])
        r["manufacturerEntity"] = manufacturer_entity(r["manufacturer"])
        if not r["batchNorm"]:
            continue
        key = (r["type"], r["batchNorm"], squash(re.sub(r"\(N/?A\)", "", r["name"]))[:20], r["month"], r["lab"])  # address text varies per listing
        if key in seen:
            seen[key]["listedTimes"] = seen[key].get("listedTimes", 1) + 1
            continue
        seen[key] = r
        r["status"] = "pending"
        for url, t in texts.get(r["month"], []):
            if r["batchNorm"] and r["batchNorm"] in t and squash(r["name"])[:12] in t:
                r["pdfUrl"] = url
                r["pdfMatch"] = True
                break
        out.append(r)

    # Repeated listings: keep one record, note how often and which PDF entry numbers.
    for r in out:
        n = r.pop("listedTimes", 1)
        nums: list[int] = []
        for url, emap in entries.get(r["month"], []):
            if r.get("pdfUrl") in (None, url) and r["batchNorm"] in emap:
                nums = sorted(emap[r["batchNorm"]])
                break
        if n > 1:
            r["listedTimes"] = n
            if len(nums) >= 2:
                r["pdfEntries"] = nums[:n] if len(nums) >= n else nums

    # Hand-verified records (see verified_records.csv) are marked "verified".
    verified = {}
    if VERIFIED_CSV.exists():
        with VERIFIED_CSV.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                verified[(row["batch_norm"], row["month"], row["type"])] = row
    for r in out:
        if (r["batchNorm"], r["month"], r["type"]) in verified:
            r["status"] = "verified"
    # Rows that also appear in a CDSCO "Revise list" PDF for the same month are marked revised.
    revised = [t for m, lst in texts.items() for u, t in lst if "Revise" in u]
    for r in out:
        if r["status"] != "verified" and any(r["batchNorm"] in t and squash(r["name"])[:8] in t for t in revised):
            r["status"] = "revised"

    out.sort(key=lambda r: (r["month"], r["type"], r["name"]), reverse=True)
    for i, r in enumerate(out):
        r["id"] = hashlib.sha1(f"{r['type']}|{r['batchNorm']}|{r['name']}|{r['month']}|{r['lab']}".encode()).hexdigest()[:12]

    prev_records = json.loads((OUT / "nsq.json").read_text(encoding="utf-8")) if (OUT / "nsq.json").exists() else None
    problems = validate(out, prev_records)
    if problems:
        return keep_last_good("; ".join(problems), {"parsed": len(out), "previous": len(prev_records or [])})

    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    version = hashlib.sha256(body.encode()).hexdigest()[:16]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    months_present = sorted({r["month"] for r in out})
    expected = sorted({month_key(m) for m in window})
    prev = json.loads((OUT / "meta.json").read_text(encoding="utf-8")) if (OUT / "meta.json").exists() else {}
    try:
        if OFFLINE:
            raise RuntimeError("offline")
        pending = portal_json("statesPendingSubmission", {"month": window[-1]})
        pending_states = [clean(x.get("initcap")).title() for x in pending.get("aaData", [])]
    except Exception:
        pending_states = prev.get("statesPendingLatestMonth", [])
    meta = {
        "version": version,
        "records": len(out),
        "duplicatesMerged": sum(r.get("listedTimes", 1) - 1 for r in out),
        "nsq": sum(r["type"] == "NSQ" for r in out),
        "spurious": sum(r["type"] == "SPURIOUS" for r in out),
        "verified": sum(r["status"] == "verified" for r in out),
        "pdfCrossChecked": sum(bool(r.get("pdfMatch")) for r in out),
        "earliestMonth": months_present[0] if months_present else None,
        "latestMonth": months_present[-1] if months_present else None,
        "lastSynced": prev.get("lastSynced") if OFFLINE and prev.get("lastSynced") else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "missingMonths": [m for m in expected if m not in months_present],
        "statesPendingLatestMonth": pending_states,
        "failed": failed,
        "sources": [PORTAL_PAGE, ALERT_PAGES[0]],
        "lastChecked": prev.get("lastChecked", today) if OFFLINE else today,
        "bytes": len(body.encode("utf-8")),
        "gzipBytes": len(gzip.compress(body.encode("utf-8"), 9)),
    }
    if prev.get("version") == version and not OFFLINE:
        meta["lastSynced"] = prev.get("lastSynced", meta["lastSynced"])  # data unchanged: only lastChecked moves
    added = added_records(prev_records, out)
    removed = removed_ids(prev_records, out)
    if (added or removed) and not OFFLINE:
        prepend_changelog(CHANGELOG, changelog_entry(today, added, removed, meta["latestMonth"]))
    log_run(RUN_LOG, "published" if prev.get("version") != version else "unchanged",
            {"records": len(out), "added": len(added), "removed": len(removed), "latestMonth": meta["latestMonth"], "failedFetches": len(failed)})
    (OUT / "nsq.json").write_text(body, encoding="utf-8")
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in meta.items() if k not in ("failed", "statesPendingLatestMonth")}, indent=2))
    print("failed:", len(failed))
    for f in failed:
        print("  ", f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
