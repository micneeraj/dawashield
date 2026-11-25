# Hybrid AI: what is verified and what is not

Recorded 25 November 2026. Automated checks were run against the live site and the preview channel with Playwright in Chromium. Manual checks were run on real devices by the project owner, as stated per row. Nothing here is a simulated result unless it says so.

## Configuration (from code)

- Backend: Firebase AI Logic, Gemini Developer API (`getAI(app, { backend: new GoogleAIBackend() })`, `src/lib/firebase.ts`).
- Models: `gemini-3.5-flash` and `gemini-3.5-flash-lite` (`src/lib/firebase.ts`).
- Inference modes (`src/lib/ai.ts`): `PREFER_ON_DEVICE` for speech candidates, `ONLY_ON_DEVICE` offline, `PREFER_IN_CLOUD` and `ONLY_IN_CLOUD` online, chosen per task.
- Routing for strip photos is in `src/lib/photoRoute.ts`, not in the SDK: online → cloud; offline → on-device only if Chrome reports Nano available; otherwise a clear "on-device AI not available" message.
- The UI shows the source the SDK reports (`inferenceSource`, mapped to cloud or device) in the "How this answer was made" panel.
- App Check uses reCAPTCHA Enterprise. Not changed in this release.
- Production: commit `528e5bf`, Firebase Hosting release `1795635876434000`.

## Verified

| Check | Method | Result |
|---|---|---|
| Offline deterministic check, batch 251TTF014, network disabled after load | Automated (Playwright, Chromium) | **RED, and zero requests made while offline.** The check uses no AI model. |
| Cloud explanation, batch 251TTF014, "Read simple explanation" | **Manual, real device**: project owner's iPhone, mobile data, 25 Nov 2026 | **Verified.** Explanation shown with the Cloud badge. |
| Cloud strip-photo reading, Pantosec strip | **Manual, real device**: same iPhone, mobile data | **Verified.** Read at 95–99% confidence. |
| Cloud Punjabi voice check | **Manual, real device**: same iPhone | **Verified.** Labelled "Gemini Flash · Cloud". |
| On-device Gemini Nano photo path, own Chrome, Wi-Fi off | **Manual, desktop Chrome** (project owner) | The path ran: "On this device" was shown. The output was not a usable reading: medicine "Pantosec Pantoprazole…" at 0% confidence, manufacturer "Cipila" at 0% confidence, batch empty. The owner typed the batch manually. **Not counted as a successful on-device reading.** |
| On-device Gemini Nano, Chromium on the test Windows laptop (Playwright bundled build) | Automated | `LanguageModel.availability()` returned **`downloadable`**: not installed, so the app would not use it there. No inference was run. |
| On-device Gemini Nano, installed Chrome 158 on the test laptop (Playwright `channel: "chrome"`) | Automated | `availability()` returned **`unavailable`** for text and for image. No download was started and no inference was run. |

Caveat on the Nano checks: `availability()` was called with no options. Image-specific availability is therefore **not separately confirmed**.

Hardware on the automated test laptop (measured): 15.7 GB physical RAM, Intel Iris Xe and NVIDIA MX550 adapters each reporting about 2 GB of video memory, 138 GB free on drive C.

Chrome's documented requirements, from developer.chrome.com (get-started page, last updated 20 May 2025, so possibly out of date): at least 22 GB free on the profile volume; GPU path strictly more than 4 GB VRAM; CPU path 16 GB RAM or more and 4 CPU cores or more. The model-management page (published 21 October 2025) says Chrome falls back to CPU inference only if the device meets separate static requirements, and does not give numbers. On the automated test laptop the GPU path fails on VRAM, and the CPU path fails on RAM (15.7 GB against 16 GB). This is consistent with `unavailable`. Chrome's live requirements should be checked before a device is judged again.

## Not yet verified

- **Automated laptop retest of the cloud explanation** (one attempt, after App Check throttling ended at about 18:59 UTC on 26 Nov). Scheduled for 01:07 IST on 27 Nov, session-only. The manual iPhone result above stands independently of it.
- Any on-device Gemini Nano reading that is accurate. The one desktop attempt returned 0% confidence fields.
- Failure handling when the cloud model is reachable but returns an error, as opposed to a throttle. Covered only by unit tests of the routing and error mapping (`tests/photo-route.test.ts`, `tests/mentor.test.ts`), not by a live run.
- Photo reading accuracy across a labelled set: no labelled strip photos exist yet. The Pantosec result is a single real-device check, not a measured accuracy figure.

## Do not claim

- That on-device Nano produced a usable photo reading. The one desktop attempt gave 0% confidence fields.
- That the app works with a model unavailable: it does, for matching, which needs no model. Reading a photo or getting an explanation does need one (cloud, or Nano where the browser supports it).
- Photo accuracy as a measured figure. The 95–99% is the model's reported confidence on one strip.
