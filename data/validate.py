"""Safety checks for the daily CDSCO data pipeline.

The new dataset only replaces the published one if it passes these checks;
otherwise the last good version is kept and the failure is logged.
Pure functions, unit-tested in data/test_validate.py.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REQUIRED = ("id", "type", "name", "batch", "batchNorm", "month", "sourceUrl")
MAX_DROP = 0.10  # more than 10% fewer records than last time = parse looks wrong
MAX_MISSING_FIELDS = 0.01  # more than 1% of rows missing a required field
COVERAGE_START = "2024-10"  # fixed start of the historical record; the end moves forward with new months


def in_coverage(month: str) -> bool:
    """True for alert months inside the fixed historical coverage (YYYY-MM strings)."""
    return isinstance(month, str) and month >= COVERAGE_START


def unexplained_removals(new: list[dict], prev: list[dict] | None, corrections: set[str]) -> list[dict]:
    """Previously published records missing from the new build with no documented correction.

    A record is never dropped just because it is old. Removing one needs an entry in
    data/corrections.json that names its id and the source evidence."""
    cur = {r["id"] for r in new}
    return [r for r in (prev or []) if r["id"] not in cur and r["id"] not in corrections]


def validate(new: list[dict], prev: list[dict] | None, corrections: set[str] = frozenset()) -> list[str]:
    """Return a list of problems. Empty list = safe to publish."""
    errors: list[str] = []
    if not new:
        return ["no records parsed (source down or page format changed)"]
    # Records with no printed batch number (batchUnspecified) are legitimate: batch fields may be empty.
    def required_for(r: dict) -> tuple:
        return tuple(k for k in REQUIRED if not (r.get("batchUnspecified") and k in ("batch", "batchNorm")))
    missing = [r for r in new if any(not str(r.get(k) or "").strip() for k in required_for(r))]
    if len(missing) > max(1, MAX_MISSING_FIELDS * len(new)):
        errors.append(f"{len(missing)} of {len(new)} records miss a required field ({', '.join(REQUIRED)})")
    bad_type = [r for r in new if r.get("type") not in ("NSQ", "SPURIOUS")]
    if bad_type:
        errors.append(f"{len(bad_type)} records have an unknown type")
    bad_month = [r for r in new if not (isinstance(r.get("month"), str) and len(r["month"]) == 7 and r["month"][4] == "-")]
    if bad_month:
        errors.append(f"{len(bad_month)} records have a malformed month")
    ids = [r.get("id") for r in new]
    if len(set(ids)) != len(ids):
        errors.append(f"{len(ids) - len(set(ids))} duplicate record ids after dedupe")
    if prev:
        drop = (len(prev) - len(new)) / len(prev)
        if drop > MAX_DROP:
            errors.append(f"record count dropped sharply: {len(prev)} -> {len(new)} ({drop:.0%})")
        prev_latest = max((r.get("month", "") for r in prev), default="")
        new_latest = max((r.get("month", "") for r in new), default="")
        if new_latest < prev_latest:
            errors.append(f"latest alert month went backwards: {prev_latest} -> {new_latest}")
        gone = unexplained_removals(new, prev, set(corrections))
        if gone:
            errors.append(f"{len(gone)} previously published records would be removed without a documented correction (e.g. {gone[0]['id']} {gone[0]['month']})")
    return errors


def added_records(prev: list[dict] | None, new: list[dict]) -> list[dict]:
    old = {r["id"] for r in (prev or [])}
    return [r for r in new if r["id"] not in old]


def removed_ids(prev: list[dict] | None, new: list[dict]) -> list[str]:
    cur = {r["id"] for r in new}
    return [r["id"] for r in (prev or []) if r["id"] not in cur]


def changelog_entry(day: str, added: list[dict], removed: list[str], latest: str | None) -> str:
    lines = [f"## {day}", "", f"- Added: {len(added)} records · Removed/merged: {len(removed)} · Latest alert month: {latest or '-'}"]
    by_month: dict[str, list[dict]] = {}
    for r in added:
        by_month.setdefault(r["month"], []).append(r)
    for m in sorted(by_month, reverse=True):
        lines.append(f"- {m}: {len(by_month[m])} new")
        for r in sorted(by_month[m], key=lambda x: (x["type"], x["name"]))[:200]:
            lines.append(f"  - {r['type']} · {r['name'][:70]} · batch {r['batch']} · {(r.get('manufacturerName') or '')[:50]} · id {r['id']}")
        if len(by_month[m]) > 200:
            lines.append(f"  - … and {len(by_month[m]) - 200} more")
    return "\n".join(lines) + "\n\n"


def prepend_changelog(path: Path, entry: str) -> None:
    head = "# Data CHANGELOG\n\nRecords added to `public/data/nsq.json` by the daily pipeline (newest first).\n\n"
    old = path.read_text(encoding="utf-8") if path.exists() else head
    body = old[len(head):] if old.startswith(head) else old
    path.write_text(head + entry + body, encoding="utf-8")


def log_run(path: Path, status: str, detail: dict) -> None:
    """Append one line to the pipeline log (kept to the last 200 runs)."""
    runs = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    runs.append({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "status": status, **detail})
    path.write_text(json.dumps(runs[-200:], ensure_ascii=False, indent=1), encoding="utf-8")
