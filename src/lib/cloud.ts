// Optional cloud features (all free on the Firebase Spark plan):
//   - anonymous Firebase Auth: a random device id, no name / phone / email
//   - Firestore: ONLY for users who opt in to push: push token, language, and per
//     saved medicine the batch number, company name and expiry month
//   - Firebase Cloud Messaging (web push): sent by the daily GitHub Action
//   - "Report a wrong result": result colour, batch, company, record ids, no personal data
// Firebase modules are loaded lazily so the core offline check never waits for them.
import { app } from "./firebase";
import { db, type CabinetItem } from "./db";
import { expiryMonth } from "./reminders";
import type { Level } from "./types";

type Lang = "hi" | "en";

async function services() {
  const [{ getAuth, signInAnonymously }, fs] = await Promise.all([import("firebase/auth"), import("firebase/firestore")]);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return { uid: auth.currentUser!.uid, store: fs.getFirestore(app), fs };
}

const PREF = "ds-push";
export const pushEnabled = () => { try { return localStorage.getItem(PREF) === "1"; } catch { return false; } };
const setPref = (on: boolean) => { try { localStorage.setItem(PREF, on ? "1" : "0"); } catch { /* ignore */ } };

/** Can this browser receive web push at all? */
export async function pushSupported(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in self) || !("Notification" in self)) return false;
  try {
    const { isSupported } = await import("firebase/messaging");
    return await isSupported();
  } catch {
    return false;
  }
}

async function token(): Promise<string> {
  const { getMessaging, getToken } = await import("firebase/messaging");
  const reg = await navigator.serviceWorker.ready;
  // No vapidKey: the SDK uses Firebase's default web push key for this project.
  return getToken(getMessaging(app), { serviceWorkerRegistration: reg });
}

const medId = (it: CabinetItem) => `m${it.id}`;

/** Opt in: ask permission, register the push token, upload the cabinet's minimal fields. */
export async function enablePush(lang: Lang): Promise<"ok" | "denied" | "unsupported" | "error"> {
  if (!(await pushSupported())) return "unsupported";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  try {
    const t = await token();
    const { uid, store, fs } = await services();
    await fs.setDoc(fs.doc(store, "devices", uid), { token: t, lang, updatedAt: fs.serverTimestamp() });
    setPref(true);
    await syncMeds(lang);
    return "ok";
  } catch (e) {
    console.warn("push", e);
    return "error";
  }
}

/** Opt out: delete this device's docs and stop push. */
export async function disablePush(): Promise<void> {
  setPref(false);
  try {
    const { uid, store, fs } = await services();
    const meds = await fs.getDocs(fs.collection(store, "devices", uid, "meds"));
    await Promise.all(meds.docs.map((d) => fs.deleteDoc(d.ref)));
    await fs.deleteDoc(fs.doc(store, "devices", uid));
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    await deleteToken(getMessaging(app)).catch(() => {});
  } catch (e) {
    console.warn("push off", e);
  }
}

/** Mirror the cabinet to Firestore (opted-in users only): batch, company, expiry month, language. */
export async function syncMeds(lang: Lang): Promise<void> {
  if (!pushEnabled() || !navigator.onLine) return;
  try {
    const items = await db.cabinet.toArray();
    const { uid, store, fs } = await services();
    const remote = await fs.getDocs(fs.collection(store, "devices", uid, "meds"));
    const keep = new Set(items.filter((i) => i.batch).map(medId));
    await Promise.all(remote.docs.filter((d) => !keep.has(d.id)).map((d) => fs.deleteDoc(d.ref)));
    await Promise.all(items.filter((i) => i.batch).map((it) =>
      fs.setDoc(fs.doc(store, "devices", uid, "meds", medId(it)), {
        batch: it.batch.slice(0, 40),
        company: (it.manufacturer ?? "").slice(0, 120),
        expiryMonth: expiryMonth(it.expiry),
        lang,
        updatedAt: fs.serverTimestamp(),
      })));
  } catch (e) {
    console.warn("sync meds", e);
  }
}

// ---------- Family alerts by push ----------
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Create an invite link. Whoever opens it and accepts gets this device's alerts too. */
export async function createInvite(): Promise<string> {
  const { uid, store, fs } = await services();
  const code = randomCode();
  await fs.setDoc(fs.doc(store, "invites", code), { owner: uid, createdAt: fs.serverTimestamp() });
  return `${location.origin}/?invite=${code}`;
}

/** On the family member's phone: accept the invite and register for push. */
export async function acceptInvite(code: string, lang: Lang): Promise<"ok" | "denied" | "unsupported" | "invalid" | "error"> {
  if (!/^[0-9a-f]{16,64}$/.test(code)) return "invalid";
  if (!(await pushSupported())) return "unsupported";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  try {
    const t = await token();
    const { uid, store, fs } = await services();
    const inv = await fs.getDoc(fs.doc(store, "invites", code));
    if (!inv.exists()) return "invalid";
    await fs.setDoc(fs.doc(store, "invites", code, "members", uid), { token: t, lang, updatedAt: fs.serverTimestamp() });
    return "ok";
  } catch (e) {
    console.warn("invite", e);
    return "error";
  }
}

// ---------- Report a wrong result ----------
export type WrongKind = "should-be-red" | "should-not-be-red" | "wrong-record" | "photo-misread" | "other";

/** Store a wrong-result report. No personal data: colour, reason, batch, company, record ids. */
export async function reportWrongResult(o: { level: Level; reason: string; batch?: string; company?: string; recordIds: string[]; kind: WrongKind; note?: string; datasetVersion?: string }): Promise<boolean> {
  try {
    const { store, fs } = await services();
    await fs.addDoc(fs.collection(store, "reports"), {
      level: o.level,
      reason: o.reason.slice(0, 40),
      batch: (o.batch ?? "").slice(0, 40),
      company: (o.company ?? "").slice(0, 120),
      recordIds: o.recordIds.slice(0, 10),
      kind: o.kind,
      note: (o.note ?? "").slice(0, 300),
      datasetVersion: (o.datasetVersion ?? "").slice(0, 40),
      createdAt: fs.serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.warn("report", e);
    return false;
  }
}
