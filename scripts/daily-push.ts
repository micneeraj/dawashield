// Daily push job (GitHub Actions, after the data refresh). Free: Firebase Admin
// SDK + FCM, no Cloud Functions / Blaze needed.
//   a) re-check every opted-in saved medicine against the (new) records -> push if flagged
//   b) expiry reminders about 5 days before expiry
//   c) family members who accepted an invite get flagged alerts too
// Needs secret FIREBASE_SERVICE_ACCOUNT (service account JSON). Without it, it logs and exits 0.
// Run: npx tsx scripts/daily-push.ts   (DRY_RUN=1 to only print)
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { planForMed, pushText, type RemoteMed, type SentState } from "../src/lib/pushplan";
import type { AlertRecord } from "../src/lib/types";

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const DRY = process.env.DRY_RUN === "1";
const SITE = "https://dawashield-hybrid-3023.web.app";

if (!SA) {
  console.log("daily-push: FIREBASE_SERVICE_ACCOUNT secret not set, skipping push (data refresh still ran).");
  process.exit(0);
}

initializeApp({ credential: cert(JSON.parse(SA)) });
const store = getFirestore();
const fcm = getMessaging();
const records: AlertRecord[] = JSON.parse(readFileSync("public/data/nsq.json", "utf8"));
const today = new Date();

let sentCount = 0, failed = 0, removed = 0;

async function send(token: string, msg: { title: string; body: string }, kind: string, tag: string): Promise<boolean> {
  if (DRY) { console.log("DRY push", kind, msg.title); return true; }
  try {
    await fcm.send({
      token,
      data: { title: msg.title, body: msg.body, url: `${SITE}/`, kind, tag },
      webpush: { headers: { Urgency: kind === "flagged" ? "high" : "normal", TTL: String(3 * 86400) } },
    });
    sentCount++;
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    failed++;
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) return false;
    console.warn("send failed", code);
    return true;
  }
}

const devices = await store.collection("devices").get();
console.log(`daily-push: ${devices.size} opted-in devices, ${records.length} records`);

for (const dev of devices.docs) {
  const { token, lang = "en" } = dev.data() as { token: string; lang?: "hi" | "en" };
  if (!token) continue;
  const meds = await dev.ref.collection("meds").get();
  const family = await store.collection("invites").where("owner", "==", dev.id).get();
  const familyTokens: { token: string; lang: "hi" | "en" }[] = [];
  for (const inv of family.docs) {
    const mem = await inv.ref.collection("members").get();
    mem.forEach((m) => { const d = m.data(); if (d.token) familyTokens.push({ token: d.token, lang: d.lang ?? "en" }); });
  }
  let alive = true;
  for (const med of meds.docs) {
    const m = med.data() as RemoteMed;
    const sentRef = store.collection("sent").doc(`${dev.id}_${med.id}`); // server-only collection (rules deny clients)
    const sent = ((await sentRef.get()).data() ?? {}) as SentState;
    const plan = planForMed(m, records, sent, today);
    const update: Record<string, unknown> = {};
    if (plan.flag) {
      alive = await send(token, pushText("flag", lang, { batch: m.batch, level: plan.flag.level, month: plan.flag.month }), "flagged", `flag-${med.id}`);
      for (const f of familyTokens) await send(f.token, pushText("family", f.lang, { batch: m.batch, level: plan.flag.level, month: plan.flag.month }), "flagged", `fam-${med.id}`);
      update.flagKey = plan.flag.key;
    }
    if (plan.expiry && alive) {
      alive = await send(token, pushText("expiry", lang, { batch: m.batch, expiryMonth: m.expiryMonth }), "expiry", `exp-${med.id}`);
      update.expiryFor = m.expiryMonth;
    }
    if (Object.keys(update).length && !DRY) await sentRef.set({ ...update, at: FieldValue.serverTimestamp() }, { merge: true });
    if (!alive) break;
  }
  if (!alive && !DRY) {
    // Token no longer valid (app uninstalled / permission revoked): delete this device's data.
    for (const med of meds.docs) await med.ref.delete();
    await dev.ref.delete();
    removed++;
  }
}
console.log(`daily-push: sent ${sentCount}, failed ${failed}, removed stale devices ${removed}`);
