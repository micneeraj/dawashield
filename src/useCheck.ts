import { useApp, type CheckInput } from "./state";
import { matchMedicine } from "./lib/match";
import { RESULT } from "./content/messages";

/** Runs the plain-code match and opens the result screen with its fixed clip. */
export function useRunCheck() {
  const { dataset, setCheck, go, say } = useApp();
  return (input: CheckInput, cabinetId?: number) => {
    const result = matchMedicine(input, dataset?.records ?? []);
    setCheck({ input, result, at: new Date().toISOString(), cabinetId });
    go({ name: "result" });
    say(RESULT[result.level].clip);
  };
}
