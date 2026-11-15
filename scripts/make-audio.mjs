// Generate the pre-recorded voice clips with Azure TTS.
// Reads AZURE_SPEECH_KEY / AZURE_SPEECH_REGION from the environment (never stored).
//   public/audio/hi/*.mp3    hi-IN-SwaraNeural  (female, default)
//   public/audio/hi-m/*.mp3  hi-IN-MadhurNeural (male)
//   public/audio/en/*.mp3    en-IN-NeerjaNeural
// Run: npm run audio
import { mkdir, writeFile } from "node:fs/promises";
import { CLIPS } from "../src/content/messages.ts";

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION");
  process.exit(1);
}

const VOICES = [
  { dir: "hi", lang: "hi-IN", voice: "hi-IN-SwaraNeural", text: "hi" },
  { dir: "hi-m", lang: "hi-IN", voice: "hi-IN-MadhurNeural", text: "hi" },
  { dir: "en", lang: "en-IN", voice: "en-IN-NeerjaNeural", text: "en" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

for (const v of VOICES) {
  await mkdir(`public/audio/${v.dir}`, { recursive: true });
  for (const c of CLIPS) {
    const ssml =
      `<speak version="1.0" xml:lang="${v.lang}"><voice name="${v.voice}">` +
      `<prosody rate="-8%">${esc(c.text[v.text])}</prosody></voice></speak>`;
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "dawashield-audio",
      },
      body: ssml,
    });
    if (!res.ok) {
      console.error(v.voice, c.clip, res.status, await res.text());
      process.exit(1);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(`public/audio/${v.dir}/${c.clip}.mp3`, buf);
    console.log(`${v.dir}/${c.clip}.mp3 ${buf.length} bytes`);
  }
}
