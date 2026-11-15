import { useEffect, useState } from "react";
import { MessageCircle, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Field, Page, inputCls, cx } from "../components/ui";
import { Sheet } from "../components/Sheet";
import { db, type FamilyMember } from "../lib/db";

export default function Family() {
  const { t, go, lang } = useApp();
  const [list, setList] = useState<FamilyMember[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => db.family.toArray().then(setList);
  useEffect(() => { load(); }, []);

  return (
    <Page title={t("family")} onBack={() => go({ name: "home" })}>
      <Card className="mb-4 flex gap-3 bg-brand-50/60 p-4">
        <MessageCircle className="mt-0.5 shrink-0 text-[#1f9d55]" />
        <p className="text-[16px] leading-snug text-brand-900">{t("familyIntro")}</p>
      </Card>
      <div className="space-y-3">
        {list.map((m) => (
          <Card key={m.id} className="flex items-center gap-3 p-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-700 text-[19px] font-bold text-white">{m.name.slice(0, 1)}</span>
            <span className="flex-1">
              <span className="block text-[19px] font-bold">{m.name}{m.relation ? <span className="font-medium text-muted"> · {m.relation}</span> : null}</span>
              <span className="num block text-[15px] text-muted">+{m.phone}</span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700"><ShieldCheck size={14} /> {lang === "hi" ? "मंज़ूरी दी" : "Consent given"}</span>
            </span>
            <button onClick={async () => { await db.family.delete(m.id!); load(); }} className="grid h-12 w-12 place-items-center rounded-2xl text-muted hover:bg-red-soft hover:text-red-ink" aria-label={t("remove")}>
              <Trash2 size={20} />
            </button>
          </Card>
        ))}
        {!list.length && (
          <Card className="flex flex-col items-center gap-3 overflow-hidden px-6 py-9 text-center" >
            <span className="relative grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-brand-50 to-[#e6f4ef] text-brand-700 shadow-soft">
              <UserRound size={38} />
              <span className="absolute -right-1.5 -top-1.5 grid h-8 w-8 place-items-center rounded-full bg-[#1f9d55] text-white shadow-soft"><MessageCircle size={17} /></span>
            </span>
            <p className="max-w-[26ch] text-[20px] font-bold leading-snug text-ink" data-testid="family-empty">
              {lang === "hi" ? "किसी दवा पर चेतावनी आए, तो आपके बेटे या बेटी को तुरंत पता चल सकता है" : "Your son or daughter can get an alert if a saved medicine is flagged"}
            </p>
            <p className="text-[15px] text-muted">{lang === "hi" ? "WhatsApp पर, सिर्फ़ आपकी मंज़ूरी से।" : "On WhatsApp, only with your consent."}</p>
          </Card>
        )}
      </div>
      <Button full className="mt-4" icon={<Plus size={22} />} onClick={() => setOpen(true)} data-testid="add-family">{t("addFamily")}</Button>
      <AddMember open={open} onClose={() => setOpen(false)} onSaved={load} />
    </Page>
  );
}

function AddMember({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? "91" + digits : digits;
  const valid = name.trim() && full.length >= 11 && full.length <= 15 && consent;

  async function save() {
    if (!valid) return;
    await db.family.add({ name: name.trim(), relation: relation.trim() || undefined, phone: full, consentAt: new Date().toISOString() });
    setName(""); setRelation(""); setPhone(""); setConsent(false);
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("addFamily")}>
      <div className="space-y-4">
        <Field label={t("name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={`${t("relation")} · ${t("optional")}`}><input className={inputCls} value={relation} onChange={(e) => setRelation(e.target.value)} /></Field>
        <Field label={t("phone")} hint="+91">
          <input className={cx(inputCls, "num")} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-brand-700" />
          <span className="text-[16px] leading-snug">{t("consent")}</span>
        </label>
        <Button full disabled={!valid} onClick={save}>{t("save")}</Button>
      </div>
    </Sheet>
  );
}
