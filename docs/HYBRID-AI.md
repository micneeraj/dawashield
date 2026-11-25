# Hybrid AI: what is verified and what is not

Recorded 25 November 2026. Checks were run against the live site and the preview channel with Playwright in Chromium. Nothing here is a simulated result unless it says so.

## Configuration (from code)

- Backend: Firebase AI Logic, Gemini Developer API (`getAI(app, { backend: new GoogleAIBackend() })`, `src/lib/firebase.ts`).
- Models: `gemini-3.5-flash` and `gemini-3.5-flash-lite` (`src/lib/firebase.ts`).
- Inference modes (`src/lib/ai.ts`): `PREFER_ON_DEVICE` for speech candidates, `ONLY_ON_DEVICE` offline, `PREFER_IN_CLOUD` and `ONLY_IN_CLOUD` online, chosen per task.
- Routing for strip photos is in `src/lib/photoRoute.ts`, not in the SDK: online → cloud; offline → on-device only if Chrome reports Nano available; otherwise a clear "on-device AI not available" message.
- The UI shows the source the SDK reports (`inferenceSource`, mapped to cloud or device) in the "How this answer was made" panel.
- App Check uses reCAPTCHA Enterprise. Not changed in this release.

## Verified in browser runs

| Check | Result |
|---|---|
| Offline deterministic check, batch 251TTF014, network disabled after load | **RED, and zero requests made while offline.** The check uses no AI model. |
| Cloud explanation, batch 251TTF014, online, "Read simple explanation" | **Not verified.** The request reached `firebasevertexai` for `gemini-3.5-flash` and returned **401**. The App Check token could not be issued: "Requests throttled due to previous 403 error. Attempts allowed again after 23h59m (appCheck/initial-throttle)". No explanation text was produced. |
| On-device Gemini Nano, Chromium on this Windows machine (Playwright bundled build) | `LanguageModel.availability()` returned **`downloadable`**: the model is not yet installed, so the app would not use it here. No on-device inference was run. |
| On-device Gemini Nano, installed Chrome 158 (Playwright `channel: "chrome"`) | `availability()` returned **`unavailable`** for text and for image. No download was started and no inference was run. |

Hardware on the test laptop (measured): 15.7 GB physical RAM, Intel Iris Xe and NVIDIA MX550 adapters each reporting about 2 GB of video memory, 138 GB free on drive C.

Chrome's documented requirements, from developer.chrome.com (get-started page, last updated 20 May 2025, so possibly out of date): at least 22 GB free on the profile volume; GPU path strictly more than 4 GB VRAM; CPU path 16 GB RAM or more and 4 CPU cores or more. The model-management page (published 21 October 2025) says Chrome falls back to CPU inference only if the device meets separate static requirements, and does not give numbers. On this laptop the GPU path fails on VRAM, and the CPU path fails on RAM (15.7 GB against 16 GB). This is consistent with `unavailable`. Chrome's live requirements should be checked before the device is judged again.

## Not verified in this release

- A successful Gemini Flash explanation for 251TTF014. Blocked by App Check throttling, which lasts about 24 hours from the last 403.
- Any real Gemini Nano inference and its returned source. Requires the model to be installed on a supported device.
- Failure handling when the cloud model is reachable but returns an error, as opposed to a throttle. Covered only by unit tests of the routing and error mapping (`tests/photo-route.test.ts`, `tests/mentor.test.ts`), not by a live run.
- Photo reading accuracy: no labelled strip photos exist yet.

## Do not claim

- That cloud explanations work in this release.
- That on-device Nano was used for any check.
- That the app works with a model unavailable: it does, for matching, which needs no model. Reading a photo or getting an explanation does need one.
