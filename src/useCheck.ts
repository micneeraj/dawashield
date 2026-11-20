import { useApp, type CheckInput } from "./state";
import { matchMedicine } from "./lib/match";
import { AMBER_REASON, RESULT } from "./content/messages";

/** Runs the plain-code match and opens the result screen with its fixed clip. */
export function useRunCheck() {
  const { dataset, setCheck, go, say } = useApp();
  return (input: CheckInput, cabinetId?: number) => {
    const records = dataset?.records ?? [];
    const t0 = performance.now();
    const result = matchMedicine(input, records);
    const matchMs = Math.max(1, Math.round(performance.now() - t0));
    setCheck({ input, result, at: new Date().toISOString(), cabinetId, matchMs, searched: records.length });
    go({ name: "result" });
    // AMBER: the clip that says why (possible company, near batch, company scope...).
    say(result.level === "AMBER" && AMBER_REASON[result.reason] ? `amber_${result.reason.replace(/-/g, "_")}` : RESULT[result.level].clip);
  };
}
