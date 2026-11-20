import { useState } from "react";
import { BellRing, Copy, Check, Share2 } from "lucide-react";
import { useApp } from "../state";
import { Button, Card } from "./ui";
import { createInvite, pushEnabled } from "../lib/cloud";

/** Optional: push alerts to a family member's own phone after they accept an invite link. */
export function FamilyPush() {
  const { lang, online, go } = useApp();
  const hi = lang === "hi";
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const on = pushEnabled();

  async function make() {
    setBusy(true); setErr(false);
    try { setLink(await createInvite()); } catch { setErr(true); } finally { setBusy(false); }
  }
  const text = hi
    ? `दवा कवच: मेरी सहेजी किसी दवा पर सरकारी चेतावनी आए तो आपके फ़ोन पर सूचना आए, इसके लिए यह लिंक खोलकर "स्वीकार करें" दबाइए: ${link}`
    : `DawaShield: open this link and tap "Accept" to get a notification on your phone if any of my saved medicines gets an official alert: ${link}`;

  return (
    <Card className="mt-4 p-5" >
      <h3 className="flex items-center gap-2 text-[18px] font-bold"><BellRing size={20} className="text-brand-600" aria-hidden /> {hi ? "परिवार के फ़ोन पर सीधी सूचना" : "Alerts on a family member's phone"}</h3>
      <p className="mt-1 text-[15.5px] leading-snug text-muted">
        {hi ? "वैकल्पिक। वे लिंक खोलकर स्वीकार करें, तो आपकी सहेजी दवा पर चेतावनी आते ही उनके फ़ोन पर भी सूचना जाएगी। किसी का नाम या नंबर नहीं रखा जाता।"
            : "Optional. Once they open the link and accept, they get a notification too when one of your saved medicines is flagged. No names or numbers are stored."}
      </p>
      {!on ? (
        <Button variant="soft" full className="mt-3" onClick={() => go({ name: "settings" })} data-testid="family-push-needs">{hi ? "पहले सेटिंग में सूचनाएँ चालू करें" : "First turn on alerts in Settings"}</Button>
      ) : !link ? (
        <Button full className="mt-3" icon={<Share2 size={20} />} disabled={busy || !online} onClick={make} data-testid="family-invite">{hi ? "निमंत्रण लिंक बनाएँ" : "Create invite link"}</Button>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-2xl bg-paper p-3 text-[14px] text-ink" data-testid="invite-link">{link}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<Share2 size={20} />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")}>WhatsApp</Button>
            <Button variant="secondary" icon={copied ? <Check size={20} /> : <Copy size={20} />} onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* ignore */ } }}>{copied ? (hi ? "कॉपी हुआ" : "Copied") : (hi ? "कॉपी" : "Copy")}</Button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-[15px] font-semibold text-amber-ink">{hi ? "लिंक नहीं बन सका। फिर कोशिश कीजिए।" : "Couldn't create the link. Try again."}</p>}
    </Card>
  );
}
