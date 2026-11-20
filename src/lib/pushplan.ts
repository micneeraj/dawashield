// What the daily job should send for one saved medicine. Pure, unit-tested.
// Used by scripts/daily-push.ts (GitHub Actions) with firebase-admin.
import { matchMedicine } from "./match";
import { expiryReminderDue } from "./reminders";
import type { AlertRecord, Level } from "./types";

export interface RemoteMed { batch: string; company?: string; expiryMonth?: string; lang?: "hi" | "en" }
export interface SentState { flagKey?: string; expiryFor?: string }
export interface PushPlan {
  flag?: { key: string; level: Level; month: string; recordId: string };
  expiry?: boolean;
}

/** Reasons that mean "this exact batch is on a list" (worth a push). */
const PUSH_REASONS = new Set(["exact", "possible-company", "batch-other-company", "near-batch"]);

export function planForMed(med: RemoteMed, records: AlertRecord[], sent: SentState, today: Date): PushPlan {
  const plan: PushPlan = {};
  if (med.batch) {
    const r = matchMedicine({ batch: med.batch, manufacturer: med.company || undefined }, records);
    if (r.level !== "GREY" && PUSH_REASONS.has(r.reason) && r.records.length) {
      const key = `${r.level}:${r.records.map((x) => x.id).sort().join(",")}`;
      if (key !== sent.flagKey) plan.flag = { key, level: r.level, month: r.records[0].month, recordId: r.records[0].id };
    }
  }
  if (med.expiryMonth && expiryReminderDue(med.expiryMonth, today, sent.expiryFor === med.expiryMonth)) plan.expiry = true;
  return plan;
}

/** Notification text. Medicine names are never stored on the server, so only the batch is used. */
export function pushText(kind: "flag" | "expiry" | "family", lang: "hi" | "en", o: { batch: string; level?: Level; month?: string; expiryMonth?: string }) {
  const hi = lang === "hi";
  if (kind === "expiry") {
    return {
      title: hi ? "दवा की तारीख़ ख़त्म होने वाली है" : "A medicine is expiring soon",
      body: hi ? `बैच ${o.batch} वाली दवा की समाप्ति तिथि ${o.expiryMonth} है। केमिस्ट से नई दवा के बारे में पूछिए।` : `The medicine with batch ${o.batch} expires ${o.expiryMonth}. Ask your chemist about a fresh pack.`,
    };
  }
  const red = o.level === "RED";
  const who = kind === "family" ? (hi ? "परिवार की सहेजी " : "A family member's saved ") : (hi ? "आपकी सहेजी " : "Your saved ");
  return {
    title: red ? (hi ? "सरकारी चेतावनी मिली" : "Official alert found") : (hi ? "मिलती-जुलती सरकारी चेतावनी" : "Possible official alert"),
    body: hi
      ? `${who}दवा (बैच ${o.batch}) CDSCO की ${o.month} की सूची से ${red ? "मिलती है" : "मिलती-जुलती है"}। दवा कवच खोलकर देखिए। डॉक्टर या केमिस्ट से बात किए बिना अगली खुराक न लें; ज़रूरी दवा अचानक बंद न करें।`
      : `${who}medicine (batch ${o.batch}) ${red ? "matches" : "may match"} CDSCO's ${o.month} list. Open DawaShield to see. Don't take the next dose until you speak to your doctor or chemist; never stop an essential medicine suddenly.`,
  };
}
