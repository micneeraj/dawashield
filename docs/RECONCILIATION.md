# Data reconciliation: October 2026 refresh

Recorded 2026-11-26. Published dataset version `361766925428bd24` (4,480 records).

Sources: CDSCO NSQ portal (`cdscoonline.gov.in/CDSCO/viewPublicNSQDrug`), cached in `data/raw/portal/`. Previous release: commit `8bd0e26`, 4,158 records.

## 1. Record count, opening to closing

| Step | Records |
|---|---|
| Opening (previous release, commit `8bd0e26`) | 4,158 |
| + Added: NSQ, alert month 2026-10 | +322 |
| + Added: SPURIOUS, alert month 2026-04 (reclassified, see §3) | +1 |
| − Removed: NSQ, alert month 2026-04 (reclassified, see §3) | −1 |
| − Removed by the old rolling window (October 2024) | 0 (restored, see §2) |
| **Closing** | **4,480** |

Check: 4,158 + 323 − 1 = 4,480. Closing NSQ 4,430, SPURIOUS 50.

## 2. Historical records restored

The previous pipeline kept a rolling 24-month window. Adding October 2026 pushed October 2024 out and removed 91 valid NSQ records. The window is now a fixed coverage start of October 2024, with the end moving forward (`COVERAGE_START` in `data/validate.py`). All 91 are back, and so are the 6 verified records among them (verified count 49 → 55).

The build also refuses to publish if a previously published record would disappear without a documented correction (`data/corrections.json`). Tests: `data/test_validate.py`, class `HistoricalRetentionTest`.

## 3. Corrections

| Record | Change | Evidence |
|---|---|---|
| `596d2870ba90` NSQ, Telmisartan Tablets IP 40 mg, batch 2513000079, Alembic, April 2026 | Replaced by spurious record `075824179e2f` (same batch and manufacturer) | The CDSCO portal's spurious tab for April 2026 lists batch 2513000079 as Under Investigation (`data/raw/portal/spurious_Apr-2026.json`). The NSQ tab does not. |

## 4. October 2026: 324 portal rows vs 322 records

| Portal rows | 324 |
|---|---|
| Exact duplicate listing (batch GT60004, Cefixime Tablets 200mg, DTL Bhopal, identical in every field) | −1 correctly merged |
| Two different listings merged in error (batch "Not Mention", Codeine Phosphate & Triprolidine Syrup, Lucknow) | −1 |
| **Records created** | **322** |

The two "Not Mention" listings differ in manufacturer (Wings Biotech LLP, Baddi, mfg Aug-2025; Cost 2 Cost Bio Pharma, Roorkee, mfg Dec-2025). They were merged because the existing dedupe key (type, batch, first 20 letters of the name, month, lab) ignores the manufacturer and the batch was blank. **This is a real defect. One official alert listing is not represented in the app.** The dedupe rule was left unchanged, as instructed. Fixing it means changing the key to include the manufacturer, and that changes the record count. It needs your decision.

Totals of the portal's October 2026 list: 37 CDSCO Labs and 287 State Labs, which matches the Ministry's 324 announced on 25 November 2026.

## 5. Verified benchmark

- Before: 55 hand-verified records. After the window change: 49 (six October 2024 records lost with the window).
- Now: **55**. All were restored with their status.

## 6. Source freshness

- Latest covered alert month: 2026-10. Missing months in coverage: none.
- Last published dataset change: 2026-11-25.
- Last successful source check: 2026-11-25 (no failed fetch, no missing month).
- Earlier release timestamps are reported in `data/pipeline_log.json`.

## 7. Open items

- The Not Mention false merge (§4).
- Real-device push delivery is not verified; see `docs/PRIVACY.md`.
