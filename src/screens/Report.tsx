import { useState } from "react";
import { Copy, ExternalLink, Mail, Phone, Check } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Disclaimer, Page } from "../components/ui";
import { OFFICIAL, complaintMessage } from "../content/messages";
import { monthLabel } from "../lib/format";

export default function Report() {
  const { t, lang, check } = useApp();
  const [copied, setCopied] = useState(false);
  const r = check?.result.records[0];
  const text = complaintMessage(lang, {
    name: check?.input.name || r?.name || "",
    batch: check?.input.batch || r?.batch || "",
    manufacturer: check?.input.manufacturer || r?.manufacturerName,
    expiry: check?.input.expiry,
    level: check?.result.level ?? "",
    month: r ? `${monthLabel(r.month, lang)} (${r.type})` : undefined,
  });
  const subject = lang === "hi" ? "संदिग्ध दवा की सूचना" : "Reporting a suspected medicine";

  return (
    <Page title={t("reportTitle")}>
      <p className="mb-4 text-[17px] leading-snug text-muted">{t("reportIntro")}</p>
      <Card className="p-4">
        <pre className="whitespace-pre-wrap font-sans text-[16px] leading-relaxed text-ink">{text}</pre>
        <Button variant="soft" full className="mt-3" icon={copied ? <Check size={20} /> : <Copy size={20} />}
          onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* ignore */ } }}>
          {copied ? t("copied") : t("copy")}
        </Button>
      </Card>

      <h2 className="mb-2 mt-6 px-1 text-[18px] font-bold">CDSCO</h2>
      <div className="grid gap-3">
        <a href={`mailto:${OFFICIAL.cdscoEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>
          <Card className="flex min-h-[64px] items-center gap-3 px-4 py-3">
            <Mail className="text-brand-600" />
            <span className="flex-1"><b className="block text-[17px]">{t("emailCdsco")}</b><span className="text-[15px] text-muted">{OFFICIAL.cdscoEmail}</span></span>
          </Card>
        </a>
        <a href={`tel:${OFFICIAL.cdscoTollFree.replace(/\s/g, "")}`}>
          <Card className="flex min-h-[64px] items-center gap-3 px-4 py-3">
            <Phone className="text-brand-600" />
            <span className="flex-1"><b className="block text-[17px]">{t("callCdsco")}</b><span className="num text-[15px] text-muted">{OFFICIAL.cdscoTollFree}</span></span>
          </Card>
        </a>
        <a href={OFFICIAL.cdscoContactUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-1 text-[15px] font-semibold text-brand-700">
          cdsco.gov.in <ExternalLink size={15} />
        </a>
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[18px] font-bold">{t("pvpi")}</h2>
      <div className="grid gap-3">
        <a href={`tel:${OFFICIAL.pvpiHelpline.replace(/\s/g, "")}`}>
          <Card className="flex min-h-[64px] items-center gap-3 px-4 py-3">
            <Phone className="text-brand-600" />
            <span className="flex-1"><b className="block text-[17px]">{t("pvpiCall")}</b><span className="num text-[15px] text-muted">{OFFICIAL.pvpiHelpline} · {lang === "hi" ? "कार्य दिवस, 9–5:30" : "working days, 9–5:30"}</span></span>
          </Card>
        </a>
        <a href={OFFICIAL.pvpiUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-1 text-[15px] font-semibold text-brand-700">
          ipc.gov.in/PvPI <ExternalLink size={15} />
        </a>
      </div>
      <Disclaimer className="mt-6" />
    </Page>
  );
}
