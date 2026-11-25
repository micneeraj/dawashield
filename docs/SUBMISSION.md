# Submission text (Devpost) and video correction

Every figure below is taken from the published files: `public/data/meta.json`, `src/content/eval-population.json`, `src/content/eval-results.json`. Figures as of 25 November 2026.

## Devpost text

**DawaShield** checks a medicine strip against the Indian government's own list of drug quality alerts, on the phone, in Hindi or English.

- **Official data:** 4,480 CDSCO records, alert months October 2024 to October 2026 (latest: October 2026). Records are added by a daily pipeline from the official portal and monthly PDFs. Historical records are kept; the pipeline refuses to remove one without a documented correction and source evidence.
- **Completeness:** every one of the 4,480 official records, queried with its own exact batch, medicine and company, is shown RED (4,480 of 4,480). Ground truth is the government record itself.
- **False alarms:** for 2,000 synthetic batches absent from the dataset, with companies also absent from it, the app returned GREY (no alert invented). Seed 20261125, reproducible.
- **Robustness:** a 728-case stress set in 16 groups. These cases and their expected labels were written by the author from 55 hand-verified records, so this measures consistent, safe behaviour under stress, not accuracy on unseen data. 0 false REDs, 0 false GREYs, every colour correct.
- **Speech:** 60 generated Hindi and English transcripts that imitate real speech-recognition output, not recordings of real speakers. 98.3% correct at first guess, 100% within three.
- **Freshness:** the app shows the latest covered alert month, the dataset's last update, and the last successful source check.
- **Privacy:** the full list and your cabinet are stored on the phone. Only devices that opt in to push store anything in Firestore: a push token, language, and each saved medicine's batch, company and expiry month. Names, phone numbers and contacts stay on the phone. Strip photos, voice clips, speech transcripts and record text are sent to Gemini when online, and medicine names are included in those requests. See `docs/PRIVACY.md`.
- **Not verified:** push alerts with the app or browser fully closed have not been tested on a real Android phone or iPhone.
- **Limitations:** one official October 2026 listing (batch "Not Mention", two different products from different manufacturers) is merged with another and not represented in the app; see `docs/RECONCILIATION.md`. The photo evaluation has no labelled photos yet.

## Demo video: outdated numbers and a dated correction

The video cannot be edited from this repository. The on-screen figures below come from the demo scripts in `scripts/demo/` (not committed). Please check the video itself against this list before you post the correction.

| Claim in the video or earlier text | Status now |
|---|---|
| "428 cases" in the matching evaluation | Now 728 cases. The stress set grew from 428 to 728 after 300 cases were added. |
| "Checked against 4,158 official CDSCO records" | Now 4,480 records (alert months Oct 2024 to Oct 2026). |
| "CDSCO flags 330 drug samples as not of standard quality in September 2026" (a news card) | This is a news headline, not a DawaShield figure. It has not been checked against the CDSCO portal. Remove or verify it. |
| Speech cases described as "real" Hindi transcripts | They are generated transcripts that imitate real speech-recognition output. |
| Any statement that push works with the app closed | NOT VERIFIED on real devices. |

### YouTube description correction (dated)

> **Correction, 25 November 2026:** Earlier figures in this video's description and on our submission page are out of date. The dataset now holds 4,480 official CDSCO records, covering alert months October 2024 to October 2026 (it was 4,158). The matching stress set has 728 cases (it was described as 428). Those 728 cases were written by the author from hand-verified records, so they measure consistent behaviour under stress, not accuracy on unseen data. The speech tests are 60 generated transcripts, not recordings of real speakers. Push alerts with the app fully closed have not been tested on real phones. Full details: https://github.com/micneeraj/dawashield/blob/master/docs/SUBMISSION.md
