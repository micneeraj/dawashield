// Dataset sync + cabinet re-check. All matching happens on the device.
import { db, type CabinetItem } from "./db";
import { matchMedicine } from "./match";
import { expiryStatus, reminderDate } from "./expiry";
import type { AlertRecord, DatasetMeta } from "./types";

export interface Dataset {
  meta: DatasetMeta;
  records: AlertRecord[];
}

async function fetchJson<T>(url: string, fresh: boolean): Promise<T> {
  // A query string makes the request miss the service-worker precache and hit the network.
  const res = await fetch(fresh ? `${url}?t=${Date.now()}` : url, fresh ? { cache: "no-store" } : undefined);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

/** Load the dataset: IndexedDB first, else the copy bundled with the app
 *  (precached by the service worker, so this also works offline). */
export async function loadDataset(): Promise<Dataset | null> {
  const row = await db.dataset.get("current");
  if (row) return { meta: row.meta, records: row.records };
  try {
    const [meta, records] = await Promise.all([
      fetchJson<DatasetMeta>("/data/meta.json", false),
      fetchJson<AlertRecord[]>("/data/nsq.json", false),
    ]);
    await db.dataset.put({ key: "current", version: meta.version, meta, records, savedAt: new Date().toISOString() });
    return { meta, records };
  } catch {
    return null;
  }
}

/** On start when online: if meta.json has a new version, download nsq.json
 *  into IndexedDB and re-check the whole cabinet. Returns the new dataset or null. */
export async function syncIfNewer(current: Dataset | null): Promise<Dataset | null> {
  if (!navigator.onLine) return null;
  try {
    const meta = await fetchJson<DatasetMeta>("/data/meta.json", true);
    if (current && meta.version === current.meta.version) return null;
    const records = await fetchJson<AlertRecord[]>("/data/nsq.json", true);
    if (!Array.isArray(records) || !records.length) return null;
    await db.dataset.put({ key: "current", version: meta.version, meta, records, savedAt: new Date().toISOString() });
    const ds = { meta, records };
    await recheckCabinet(ds);
    return ds;
  } catch {
    return null;
  }
}

/** Re-check every saved medicine. Returns items whose colour changed to RED/AMBER. */
export async function recheckCabinet(ds: Dataset, force = false): Promise<CabinetItem[]> {
  const items = await db.cabinet.toArray();
  const changed: CabinetItem[] = [];
  const now = new Date().toISOString();
  for (const it of items) {
    const stale = !it.lastCheck || it.lastCheck.version !== ds.meta.version ||
      Date.now() - Date.parse(it.lastCheck.at) > 30 * 86_400_000; // monthly re-check
    if (!force && !stale) continue;
    const r = matchMedicine({ name: it.name, batch: it.batch, manufacturer: it.manufacturer }, ds.records);
    const prev = it.lastCheck?.level;
    it.lastCheck = { level: r.level, reason: r.reason, recordIds: r.records.map((x) => x.id), version: ds.meta.version, at: now };
    if (prev && prev !== r.level) {
      it.changedAt = now;
      if (r.level !== "GREY") changed.push(it);
    }
    await db.cabinet.put(it);
  }
  if (changed.length) await notify("DawaShield", `${changed.length} saved medicine(s) now match an official alert. Open to see.`, "recheck");
  return changed;
}

/** Local notification (no server push). */
export async function notify(title: string, body: string, tag: string, url = "/"): Promise<void> {
  if (!("Notification" in self) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url } });
    else new Notification(title, { body, tag });
  } catch {
    /* notifications are a convenience only */
  }
}

/** About 5 days before expiry, show one local notification per medicine.
 *  Web apps cannot schedule notifications while closed, so this runs on app start. */
export async function expiryReminders(lang: "hi" | "en"): Promise<void> {
  const items = await db.cabinet.toArray();
  for (const it of items) {
    const when = reminderDate(it.expiry);
    if (!when || Date.now() < when.getTime() || it.expiryNotified === it.expiry) continue;
    const st = expiryStatus(it.expiry);
    const body = lang === "hi"
      ? `${it.who ? it.who + " की " : ""}${it.name}: ${st === "expired" ? "तारीख़ निकल गई" : "तारीख़ जल्द ख़त्म"}`
      : `${it.name}${it.who ? ` (${it.who})` : ""}: ${st === "expired" ? "expired" : "expires soon"}`;
    await notify("DawaShield", body, `exp-${it.id}`);
    it.expiryNotified = it.expiry;
    await db.cabinet.put(it);
  }
}

/** Family alerts queued while offline: notify when the internet is back. */
export async function flushQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  const q = await db.queue.toArray();
  for (const item of q) await notify("DawaShield", `Family alert ready to send to ${item.to}`, `q-${item.id}`, item.url);
  return q.length;
}
