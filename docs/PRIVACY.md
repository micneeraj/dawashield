# Privacy: what is stored and what is processed

This page is written from the code (`src/lib/db.ts`, `src/lib/cloud.ts`, `src/lib/ai.ts`, `src/lib/speech.ts`, `src/lib/sync.ts`, `firestore.rules`). The app has no analytics SDK. Its Info screen says "No ads, no analytics, no tracking", and no analytics or tracking library was found in the source.

**Storing** and **processing** are different. Data can be stored on the phone and still leave it when a cloud AI call is made. The table below separates them.

## 1. Stored on the phone (IndexedDB, Dexie)

| Table | What it holds | Leaves the device? |
|---|---|---|
| `dataset` | The full official CDSCO list, downloaded from the app's own hosting | No (downloaded, not uploaded) |
| `cabinet` | Medicines the user saved: name, batch, company, expiry, and a "who" label | Only the minimal fields below, and only if the user opts in to push |
| `family` | Family members the user adds | Only if the user shares an invite |
| `queue` | Family alerts waiting for the connection to return. Holds the recipient name and link | No. Handled locally when online |
| `localStorage` | A nickname, the "My contacts" phone numbers used by one-tap Call buttons, the cloud push preference, and welcome-screen flags (`src/lib/profile.ts`, `src/lib/cloud.ts`) | No. The contacts are never sent to Firestore |

Nothing is stored in an account. The app works offline for matching. The source does not write photos or voice clips to storage (checked: no IndexedDB or localStorage write takes a photo or audio blob).

## 2. Stored in Firestore (only for devices that opt in to push)

Each device is identified by an anonymous Firebase Auth user id. The rules (`firestore.rules`) allow each device to read and write only its own documents.

| Path | Fields |
|---|---|
| `devices/{uid}` | FCM push token, language (`hi` or `en`), updated time |
| `devices/{uid}/meds/{id}` | Batch number, company name, expiry month, language, updated time |
| `invites/{code}` | Owner uid, created time (invite codes are needed to join a family) |
| `invites/{code}/members/{uid}` | A family member's push token and language |
| `reports/{id}` (write-only) | Result colour, reason, batch, company, record IDs, kind, optional note (≤300 characters), dataset version, created time |

Not stored: names of the user, phone numbers, photos, voice recordings, health information. The rules reject any other field. The user can delete the device document, and removing the app data deletes the local copy.

The daily push job (`scripts/daily-push.ts`) reads the `meds` documents and the official dataset, and sends a push notification when a saved batch is flagged or when expiry is near.

## 3. Sent to Gemini (Firebase AI Logic) when the device is online

Gemini is called only for these actions. The offline check runs on the phone and needs no network.

| Action | What is sent | Medicine names included? |
|---|---|---|
| Reading a strip photo | The photo | Yes, if the name is printed on the strip, because the photo shows it |
| Transcribing a voice clip (`transcribeAudio`) | The recorded audio clip | Yes, as spoken |
| Choosing medicine candidates from speech (`candidatesFromSpeech`) | The transcript text | Yes |
| Explaining a record (`explainRecord`) | The official record: name, batch, company, reason, dates | Yes |
| Follow-up questions (`askChat`) | The question and the record | Yes |

When the device is offline and the phone supports on-device Gemini Nano, the same reading and explaining steps run on the phone and nothing is sent. Without Nano, the app asks the user to type the batch instead.

Speech recognition in the browser (`src/lib/speech.ts`) is handled by the browser, not by our servers. The app asks for on-device recognition when the language pack is present. If not, the browser may send audio to its speech provider. Whether this happens depends on the browser and the language pack, and the app cannot control it.

Medicine names are therefore **not** kept only on the device. They leave the phone during cloud reading, speech and explanation requests. They are not stored in our Firestore unless the user opts in to push, and then only the batch, company and expiry month are stored.

## 4. Sent to our hosting

The app downloads `meta.json` and `nsq.json` from Firebase Hosting. The downloads are not personalised. Hosting logs are kept by Firebase under its own terms.

## 5. Push notifications: status

Real-device push delivery with the app or browser fully closed is **NOT VERIFIED**. The code path exists (service worker, FCM token, daily job), and its unit and logic checks pass. No test on an Android phone or an iPhone home-screen app has been run, so do not claim closed-app delivery until it has been tested on both.

## 6. Limits

- Firebase AI Logic and the browser speech provider process data under their own terms.
- App Check and reCAPTCHA protect the cloud AI calls from abuse. They do not change what is sent.
- The Hindi and English speech evaluation uses generated transcripts, not recordings of people (see `docs/EVAL.md`).
