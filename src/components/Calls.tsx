// One-tap Call buttons on RED / AMBER results, the "Add number" sheet, and the
// Settings "My contacts" card. Numbers live only on this device.
import { useState } from "react";
import { BookUser, Phone, PhoneCall, Stethoscope, Store, Users } from "lucide-react";
import { useApp } from "../state";
import { Sheet } from "./Sheet";
import { Button, Card, cx, inputCls } from "./ui";
import { CALL_LABEL, CONTACT_KINDS, CONTACT_LABEL, cleanPhone, getContacts, saveContacts, telHref, type ContactKind, type Contacts } from "../lib/profile";

const ICON: Record<ContactKind, typeof Phone> = { family: Users, doctor: Stethoscope, chemist: Store };

const T = {
  add: { hi: "नंबर जोड़ें", en: "Add number" },
  addFor: { hi: "नंबर सहेजें, फिर एक बार दबाकर कॉल करें", en: "Save the number once, then call with one tap" },
  save: { hi: "सहेजें और कॉल करें", en: "Save and call" },
  saveOnly: { hi: "सहेजें", en: "Save" },
  bad: { hi: "सही फ़ोन नंबर लिखिए (6 से 15 अंक)", en: "Enter a valid phone number (6 to 15 digits)" },
  familyName: { hi: "परिवार में किसका नंबर? (जैसे बेटा, नीरज)", en: "Whose number? (e.g. Son, Neeraj)" },
  title: { hi: "मेरे संपर्क", en: "My contacts" },
  sub: { hi: "नतीजे पर एक बटन से कॉल के लिए। नंबर सिर्फ़ इसी फ़ोन में रहते हैं।", en: "For one-tap calls from a result. Numbers stay only on this phone." },
  saved: { hi: "सहेजा गया", en: "Saved" },
  notSet: { hi: "नंबर नहीं जोड़ा", en: "No number yet" },
};

/** Big full-width Call family / doctor / chemist buttons. RED and AMBER only (caller decides). */
export function CallButtons({ className }: { className?: string }) {
  const { lang } = useApp();
  const [contacts, setContacts] = useState<Contacts>(() => getContacts());
  const [adding, setAdding] = useState<ContactKind | null>(null);
  return (
    <div className={cx("mt-4 space-y-2.5", className)} data-testid="call-buttons">
      {CONTACT_KINDS.map((k) => {
        const href = telHref(contacts, k);
        const Icon = ICON[k];
        const label = k === "family" && contacts.familyName ? `${CALL_LABEL.family[lang]} · ${contacts.familyName}` : CALL_LABEL[k][lang];
        const cls = cx(
          "tap flex w-full items-center gap-3 rounded-2xl px-5 py-3 text-left text-[19px] font-bold shadow-soft active:scale-[0.98]",
          k === "doctor" ? "bg-accent-strong text-white hover:bg-brand-700" : "border border-line bg-white text-brand-900 hover:border-brand-300",
        );
        const inner = (
          <>
            <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", k === "doctor" ? "bg-white/15" : "bg-accent-soft text-brand-700")}><Icon size={22} aria-hidden /></span>
            <span className="flex-1 leading-tight">{label}</span>
            {href ? <PhoneCall size={22} aria-hidden /> : <span className={cx("text-[14px] font-semibold", k === "doctor" ? "text-white/85" : "text-muted")}>{T.add[lang]}</span>}
          </>
        );
        return href
          ? <a key={k} href={href} className={cls} data-testid={`call-${k}`}>{inner}</a>
          : <button key={k} type="button" className={cls} onClick={() => setAdding(k)} data-testid={`call-${k}`}>{inner}</button>;
      })}
      <AddNumberSheet kind={adding} onClose={() => setAdding(null)} onSaved={(c, call) => {
        setContacts(c);
        const k = adding; setAdding(null);
        if (call && k) { const h = telHref(c, k); if (h) location.href = h; }
      }} />
    </div>
  );
}

/** Simple sheet: one number (plus a name for family). */
export function AddNumberSheet({ kind, onClose, onSaved, callAfter = true }: { kind: ContactKind | null; onClose: () => void; onSaved: (c: Contacts, call: boolean) => void; callAfter?: boolean }) {
  const { lang } = useApp();
  const [num, setNum] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (!kind) return;
    if (!cleanPhone(num)) { setErr(true); return; }
    const c = saveContacts({ ...getContacts(), [kind]: num, ...(kind === "family" && name.trim() ? { familyName: name } : {}) });
    setNum(""); setName(""); setErr(false);
    onSaved(c, callAfter && /Mobi|Android|iPhone/i.test(navigator.userAgent));
  };
  return (
    <Sheet open={!!kind} onClose={onClose} title={kind ? CONTACT_LABEL[kind][lang] : ""}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="add-number-sheet">
        <p className="mb-3 text-[16px] leading-snug text-muted">{T.addFor[lang]}</p>
        {kind === "family" && (
          <input className={cx(inputCls, "mb-3")} value={name} onChange={(e) => setName(e.target.value)} placeholder={T.familyName[lang]} aria-label={T.familyName[lang]} data-testid="contact-name" />
        )}
        <input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" value={num} onChange={(e) => { setNum(e.target.value); setErr(false); }}
          placeholder="98765 43210" aria-label={kind ? CONTACT_LABEL[kind][lang] : ""} aria-invalid={err} data-testid="contact-number" autoFocus />
        {err && <p className="mt-2 text-[15px] font-semibold text-ink" role="alert">{T.bad[lang]}</p>}
        <Button full type="submit" className="mt-4 min-h-14 text-[18px]" icon={<Phone size={20} />} data-testid="contact-save">{callAfter ? T.save[lang] : T.saveOnly[lang]}</Button>
      </form>
    </Sheet>
  );
}

/** Settings > My contacts: family name + number, doctor, chemist. */
export function ContactsCard({ className }: { className?: string }) {
  const { lang } = useApp();
  const [draft, setDraft] = useState<Contacts>(() => getContacts());
  const [msg, setMsg] = useState("");
  const bad = CONTACT_KINDS.filter((k) => draft[k]?.trim() && !cleanPhone(draft[k]));
  return (
    <Card className={cx("p-4", className)} data-testid="contacts-card">
      <h2 className="flex items-center gap-2 text-[19px] font-bold"><BookUser size={21} className="text-brand-700" aria-hidden /> {T.title[lang]}</h2>
      <p className="mt-1 text-[15px] leading-snug text-muted">{T.sub[lang]}</p>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[15px] font-semibold text-ink">{T.familyName[lang]}</span>
          <input className={inputCls} value={draft.familyName ?? ""} onChange={(e) => { setDraft({ ...draft, familyName: e.target.value }); setMsg(""); }} data-testid="settings-family-name" />
        </label>
        {CONTACT_KINDS.map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[15px] font-semibold text-ink">{CONTACT_LABEL[k][lang]}</span>
            <input className={inputCls} type="tel" inputMode="tel" value={draft[k] ?? ""} placeholder={T.notSet[lang]} aria-invalid={bad.includes(k)}
              onChange={(e) => { setDraft({ ...draft, [k]: e.target.value }); setMsg(""); }} data-testid={`settings-${k}`} />
          </label>
        ))}
        {bad.length > 0 && <p className="text-[15px] font-semibold text-ink" role="alert">{T.bad[lang]}</p>}
        <Button full disabled={bad.length > 0} onClick={() => { const s = saveContacts(draft); setDraft(s); setMsg(T.saved[lang]); }} data-testid="contacts-save">
          {msg ? `✓ ${msg}` : T.saveOnly[lang]}
        </Button>
      </div>
    </Card>
  );
}
