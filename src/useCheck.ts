import { useApp, type CheckInput } from "./state";
import { matchMedicine } from "./lib/match";
import { spokenClip } from "./content/messages";

/** Runs the plain-code match and opens the result screen with its fixed clip:
 *  colour + one clear sentence first, details after. */
export function useRunCheck() {
  const { dataset, setCheck, go, say } = useApp();
  return (input: CheckInput, cabinetId?: number) => {
    const records = dataset?.records ?? [];
    const t0 = performance.now();
    const result = matchMedicine(input, records);
    const matchMs = Math.max(1, Math.round(performance.now() - t0));
    setCheck({ input, result, at: new Date().toISOString(), cabinetId, matchMs, searched: records.length });
    go({ name: "result" });
    say(spokenClip(result.level, result.reason, result.records[0]?.type));
  };
}
