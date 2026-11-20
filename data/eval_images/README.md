# Photo evaluation images

Drop photos of medicine strips here to measure how well DawaShield reads them.

1. Copy photos into this folder (`.jpg`, `.jpeg`, `.png` or `.webp`), for example `crocin_back.jpg`.
2. Add one entry per photo to `labels.json` in this folder with what is **actually printed** on the strip:

```json
{
  "crocin_back.jpg": { "batch": "AB1234", "expiry": "06/2028", "name": "Crocin", "manufacturer": "GSK" }
}
```

   Leave out any field you don't want scored. Batch is compared ignoring spaces and punctuation; expiry is compared by month and year.
3. Run `npm run eval`. Each photo goes through the real app (live site, same photo pipeline: auto-crop, glare reduction, contrast boost, two reads, confidence checks) in a headless browser, and the per-field accuracy is written to `docs/EVAL.md` and shown on the in-app "How it works" page.

Photos are only used locally by the eval script and the app's normal photo reading. Don't add photos that show anyone's name, prescription or address.
