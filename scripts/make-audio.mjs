// Generate the pre-recorded voice clips with Sarvam AI (Bulbul TTS).
// The key is read from .env (SARVAM_API_KEY) and never printed or stored elsewhere.
//   public/audio/hi/*.mp3  Hindi  (hi-IN)
//   public/audio/en/*.mp3  English (en-IN)
// Run: npm run audio
import { mkdir, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { SarvamAIClient } from "sarvamai";
import { CLIPS } from "../src/content/messages.ts";

const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error("Set SARVAM_API_KEY in .env");
  process.exit(1);
}

const MODEL = "bulbul:v4-flash"; // latest Bulbul model per docs.sarvam.ai
const VOICES = [
  { dir: "hi", lang: "hi-IN", speaker: "ritu_hi_customer_warm", text: "hi" },
  { dir: "en", lang: "en-IN", speaker: "neha_en_customer", text: "en" },
];

// Optional: CLIP=red,amber regenerates only those clips.
const ONLY = process.env.CLIP ? new Set(process.env.CLIP.split(",")) : null;

const client = new SarvamAIClient({ apiSubscriptionKey: key });

for (const v of VOICES) {
  await mkdir(`public/audio/${v.dir}`, { recursive: true });
  for (const c of CLIPS) {
    if (ONLY && !ONLY.has(c.clip)) continue;
    let res;
    try {
      res = await client.textToSpeech.convert({
        text: c.text[v.text],
        language_code: v.lang,
        model: MODEL,
        speaker: v.speaker,
        pace: 0.9,
        output_audio_codec: "mp3",
      });
    } catch (e) {
      // Report the API error without echoing request headers (which carry the key).
      console.error(`${v.dir}/${c.clip}: ${e?.statusCode ?? ""} ${JSON.stringify(e?.body ?? e?.message ?? e).slice(0, 300)}`);
      process.exit(1);
    }
    const buf = Buffer.from(res.audios.join(""), "base64");
    if (buf.length < 1000) {
      console.error(`${v.dir}/${c.clip}: audio too small (${buf.length} bytes)`);
      process.exit(1);
    }
    const out = `public/audio/${v.dir}/${c.clip}.mp3`;
    await writeFile(out, buf);
    // Keep the offline download small: speech at 32 kbps mono (needs ffmpeg on PATH; skipped otherwise).
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", out, "-ac", "1", "-ar", "22050", "-b:a", "32k", out + ".tmp.mp3"]);
    if (r.status === 0) await rename(out + ".tmp.mp3", out);
    console.log(`${v.dir}/${c.clip}.mp3 ${buf.length} bytes`);
  }
}
