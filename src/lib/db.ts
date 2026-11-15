// Local storage on the device (IndexedDB via Dexie). Nothing here is uploaded.
import Dexie, { type Table } from "dexie";
import type { AlertRecord, DatasetMeta, Level, MatchReason } from "./types";

export interface DatasetRow {
  key: "current";
  version: string;
  meta: DatasetMeta;
  records: AlertRecord[];
  savedAt: string;
}

export interface CabinetItem {
  id?: number;
  name: string;
  batch: string;
  manufacturer?: string;
  expiry?: string;
  who?: string;
  addedAt: string;
  lastCheck?: { level: Level; reason: MatchReason; recordIds: string[]; version: string; at: string };
  changedAt?: string; // set when a re-check changes the colour
  expiryNotified?: string;
}

export interface FamilyMember {
  id?: number;
  name: string;
  relation?: string;
  phone: string; // digits with country code, e.g. 919812345678
  consentAt: string;
}

export interface QueuedAlert {
  id?: number;
  url: string;
  text: string;
  to: string;
  createdAt: string;
}

class DawaDB extends Dexie {
  dataset!: Table<DatasetRow, string>;
  cabinet!: Table<CabinetItem, number>;
  family!: Table<FamilyMember, number>;
  queue!: Table<QueuedAlert, number>;
  constructor() {
    super("dawashield");
    this.version(1).stores({
      dataset: "key",
      cabinet: "++id, name, who",
      family: "++id, name",
      queue: "++id, createdAt",
    });
  }
}

export const db = new DawaDB();
