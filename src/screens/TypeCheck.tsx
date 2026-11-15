import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "../state";
import { Button, Disclaimer, Field, Page, inputCls, cx } from "../components/ui";
import { searchNames } from "../lib/match";
import { COMMON_MEDICINES } from "../content/common-medicines";
import { useRunCheck } from "../useCheck";

export default function TypeCheck() {
  const { t, lang, screen, dataset } = useApp();
  const prefill = screen.name === "type" ? screen.prefill : undefined;
  const runCheck = useRunCheck();
  const [name, setName] = useState(prefill?.name ?? "");
  const [batch, setBatch] = useState(prefill?.batch ?? "");
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? "");
  const [expiry, setExpiry] = useState(prefill?.expiry ?? "");
  const [picked, setPicked] = useState(false);

  const suggestions = useMemo(
    () => (name.trim().length >= 3 && !picked ? searchNames(name, dataset?.records ?? [], COMMON_MEDICINES, 4) : []),
    [name, picked, dataset],
  );

  return (
    <Page title={lang === "hi" ? "लिखकर जाँच" : "Type to check"}>
      <form
        className="space-y-5"
        onSubmit={(e) => { e.preventDefault(); runCheck({ name, batch, manufacturer, expiry }); }}
      >
        <Field label={t("medicineName")}>
          <input className={cx(inputCls, "font-semibold")} value={name} onChange={(e) => { setName(e.target.value); setPicked(false); }} placeholder="Dolo 650" autoComplete="off" data-testid="name-input" />
        </Field>
        {suggestions.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button type="button" key={s} onClick={() => { setName(s); setPicked(true); }} className="min-h-12 rounded-full border border-brand-200 bg-brand-50 px-4 text-[16px] font-semibold text-brand-800 hover:bg-brand-100">
                {s}
              </button>
            ))}
          </div>
        )}
        <Field label={t("batchNo")} hint={t("batchHint")}>
          <input className={cx(inputCls, "num text-[26px] font-bold tracking-wider")} value={batch} onChange={(e) => setBatch(e.target.value.toUpperCase())} placeholder="B.No." autoCapitalize="characters" autoComplete="off" data-testid="type-batch" />
        </Field>
        <Field label={`${t("manufacturer")} · ${t("optional")}`}>
          <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={`${t("expiry")} · ${t("optional")}`}>
          <input className={cx(inputCls, "num")} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YYYY" autoComplete="off" />
        </Field>
        <Button type="submit" full icon={<Search size={22} />} disabled={!name.trim() && !batch.trim()} data-testid="check-btn">{t("check")}</Button>
      </form>
      <Disclaimer className="mt-6" />
    </Page>
  );
}
