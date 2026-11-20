// The medicine-name dictionary used by voice matching, built once per dataset
// from every record name plus the common Indian names list.
import { buildDictionary, type DictEntry } from "./phonetic";
import { COMMON_300, COMMON_MEDICINES } from "../content/common-medicines";

let cache: { n: number; dict: DictEntry[] } | null = null;

export function getDictionary(records: { name: string; brand?: string }[]): DictEntry[] {
  if (cache && cache.n === records.length) return cache.dict;
  cache = { n: records.length, dict: buildDictionary(records, [...COMMON_MEDICINES, ...COMMON_300]) };
  return cache.dict;
}
