# Data reconciliation

Dataset version and counts are from `public/data/meta.json`. Sources: CDSCO NSQ and spurious portal (`cdscoonline.gov.in/CDSCO/viewPublicNSQDrug`), cached per month in `data/raw/portal/`, plus the monthly PDFs.

## 1. Opening to closing (October 2026 release)

| Step | Records |
|---|---|
| Opening: release `6c38bcf` (4,480 records) | 4,480 |
| + Records separated by the corrected identity rule (8 listings that had been merged, see §3) | +8 |
| − Removed | 0 |
| **Closing** | **4,488** (NSQ 4,438, SPURIOUS 50) |

Check: 4,480 + 8 − 0 = 4,488. Nothing was removed. The earlier expected figure of 4,481 assumed one false merge; the audit found eight, so the count is not forced to 4,481.

## 2. Historical records

- Coverage is fixed from October 2024, with the end moving forward. Nothing is dropped because it is old (`COVERAGE_START` in `data/validate.py`).
- A publish is refused if a previously published record would disappear without an entry in `data/corrections.json` (`HistoricalRetentionTest` in `data/test_validate.py`).
- Verified records: **55** (the six October 2024 verified records are present).

## 3. Deduplication audit (all cached months, October 2024 to October 2026)

The old key was (type, batch, **first 20 letters of the name**, month, lab), so distinct products that share a prefix were merged, and so were lots that differed only in manufacture date or manufacturer.

The audit grouped the 4,452 cached NSQ rows under the old key. 22 groups had more than one row:

| Group | Old merge | Decision under the new rule |
|---|---|---|
| KA017 Sorbitol Solution, CDTL Hyderabad, Dec 2025 | 2 rows merged | Separated: expiry dates differ (Jul-2030, Aug-2030) |
| 1364ASO Buprenorphine Injection 2 ml, Jan 2026 | 2 merged | Separated: manufacture dates differ (Jun-2025, May-2024) |
| 1470ASG Buprenorphine (Lupigesic), Oct 2024 | 2 merged | Separated: manufacture dates differ (Jan-2024, Sep-2023) |
| 406 Beaute Blanc Hair Colour, Nov 2024 | 2 merged | Separated: different manufacturers (Kosmol Global, Guangdong Rongsheng) |
| NOT APPLICABLE Injection Oxytocin Vet., May 2025 | 2 merged | Separated: 50 ml and 100 ml vials |
| NOT MENTION Codeine Phosphate & Triprolidine, Oct 2026 | 2 merged | Separated: different manufacturers (Wings Biotech, Cost 2 Cost) |
| LRT25187 Telmisartan & Hydrochlorothiazide, Feb 2026 | 2 merged | **Kept separate**: name text differs only by "IP". Possibly one listing reprinted. Not guessed. |
| PGT25229 Albendazole, Sep 2025 | 2 merged | **Kept separate**: name text differs by "Legal Sample". Possibly one listing reprinted. Not guessed. |
| MT14501 Zinc Sulphate, Jun 2025 | 2 merged | **Still merged, correctly**: name, manufacturer, dates and lab all match. Only the address text differed. A genuine exact duplicate. |

The remaining 13 groups were already exact duplicates and stay merged.

**Rule now:** a listing is the same record only if the full product name, manufacturer entity (or full manufacturer text when the entity is blank), manufacture date, expiry date, batch, alert month and lab all match. Address and punctuation may differ.

## 4. Records with no printed batch

Some listings print "Not Mention", "NIL", "NOT APPLICABLE" or "NA" as the batch. These are not batch numbers. They are kept, marked `batchUnspecified`, given an empty `batchNorm`, and so can never match an exact batch. Their raw text is still shown as printed. Eleven records in the dataset are in this group.

Earlier, a row with an empty batch was silently skipped. No such row exists in the cached data, but the code now keeps such rows as well.

## 5. October 2026: 324 portal rows vs records

| | Count |
|---|---|
| Portal rows, October 2026 NSQ | 324 (37 CDSCO Labs, 287 State Labs in the portal list; 42/288 in the Ministry's split for September) |
| Exact duplicate merged (GT60004, Cefixime Tablets 200 mg, DTL Bhopal, identical in every field) | −1 |
| Records created | **323** |

Note: 324 rows − 1 exact duplicate = 323 distinct listings. The earlier figure of 322 was reduced by one more false merge, which the corrected rule now separates.

The Ministry's announced figure of 324 is the portal row count, not the number of distinct records.

## 6. Freshness

- Latest covered alert month: 2026-10. Months missing from coverage: none.
- Dataset last updated: 2026-11-25 (`lastSynced`).
- Last successful source check: 2026-11-25 (`lastChecked`; no failed fetch, no missing month).
- Last check attempt: 2026-11-25 (`lastCheckAttempted`).

## 7. Open items

- Two possible reprints kept as separate records (LRT25187, PGT25229). Merging them would need a rule about name wording, which was not added.
- Real-device push delivery is not verified (see `docs/PRIVACY.md`).
