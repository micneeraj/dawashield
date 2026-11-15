import { Camera, Cloud, Database, Lock, Mic, ShieldCheck, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { Card, Disclaimer, Page } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { monthLabel } from "../lib/format";

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-line/70 py-4 first:border-t-0 first:pt-0">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">{icon}</span>
      <span>
        <b className="block text-[17px]">{title}</b>
        <span className="block text-[16px] leading-snug text-muted">{children}</span>
      </span>
    </div>
  );
}

export function Privacy() {
  const { t, lang } = useApp();
  const hi = lang === "hi";
  return (
    <Page title={t("privacy")}>
      <Card className="p-5">
        <Item icon={<Mic size={22} />} title={hi ? "आवाज़" : "Voice"}>
          {hi ? "आपकी आवाज़ कभी रिकॉर्ड, सेव या अपलोड नहीं होती। ब्राउज़र उसे शब्दों में बदलता है; भाषा-पैक होने पर यह फ़ोन पर ही होता है।"
              : "Your voice is never recorded, stored or uploaded. The browser turns it into text; with the language pack this happens on the phone."}
        </Item>
        <Item icon={<Camera size={22} />} title={hi ? "फ़ोटो" : "Photos"}>
          {hi ? "फ़ोटो सेव नहीं होती। इंटरनेट होने पर सिर्फ़ वही एक फ़ोटो लेबल पढ़ने के लिए Google Gemini (Firebase AI Logic) को भेजी जाती है। बिना इंटरनेट फ़ोटो फ़ोन पर ही पढ़ी जाती है।"
              : "Photos are never stored. When online, only that single photo is sent to Google Gemini (Firebase AI Logic) to read the label. Offline, it is read on the phone."}
        </Item>
        <Item icon={<Database size={22} />} title={hi ? "दवा पेटी और परिवार" : "Cabinet and family"}>
          {hi ? "आपकी दवाएँ और परिवार के नंबर सिर्फ़ इसी फ़ोन में रहते हैं। हमारे पास कोई सर्वर या खाता नहीं है।"
              : "Your medicines and family numbers stay only on this phone. There is no DawaShield server or account."}
        </Item>
        <Item icon={<Cloud size={22} />} title={hi ? "क्लाउड AI" : "Cloud AI"}>
          {hi ? "‘आसान व्याख्या’ और सवालों के लिए सिर्फ़ सरकारी रिकॉर्ड और आपका सवाल भेजा जाता है। हर AI जवाब पर लिखा होता है कि वह फ़ोन पर बना या क्लाउड में।"
              : "For explanations and questions only the official record and your question are sent. Every AI answer is labelled On this device or Cloud."}
        </Item>
        <Item icon={<Lock size={22} />} title={hi ? "विश्लेषण नहीं" : "No tracking"}>
          {hi ? "कोई विज्ञापन या ट्रैकिंग नहीं।" : "No ads, no analytics, no tracking."}
        </Item>
      </Card>
      <Disclaimer className="mt-5" />
    </Page>
  );
}

export function About() {
  const { t, lang, dataset } = useApp();
  const hi = lang === "hi";
  const m = dataset?.meta;
  return (
    <Page title={t("about")}>
      <Card className="flex flex-col items-center p-6 text-center">
        <LogoMark size={72} />
        <h2 className="mt-3 text-[26px] font-bold">{hi ? "दवा कवच" : "DawaShield"}</h2>
        <p className="mt-2 text-[17px] leading-snug text-muted">
          {hi ? "माँ की दवा की अलमारी को सुरक्षा की जानकारी के लिए इंटरनेट, अंग्रेज़ी या बैच नंबर की समझ की ज़रूरत नहीं होनी चाहिए।"
              : "Your mother's medicine cabinet shouldn't need an internet connection, English literacy or a technical understanding of batch numbers to stay informed about medicine safety."}
        </p>
      </Card>
      <Card className="mt-4 p-5">
        <Item icon={<ShieldCheck size={22} />} title={hi ? "तीन ही नतीजे" : "Only three results"}>
          {hi ? "लाल: सरकारी चेतावनी से मेल। पीला: मिलता-जुलता, पक्का कीजिए। धूसर: सूची में नहीं मिला — यह सुरक्षा की गारंटी नहीं। ऐप कभी नहीं कहता कि दवा सुरक्षित है।"
              : "Red: matches an official alert. Amber: possible match, please confirm. Grey: not found in the list — not a safety guarantee. The app never says a medicine is safe."}
        </Item>
        <Item icon={<Smartphone size={22} />} title={hi ? "हाइब्रिड AI" : "Hybrid AI"}>
          {hi ? "Firebase AI Logic: फ़ोन पर Gemini Nano और क्लाउड में Gemini Flash। मिलान हमेशा सादे कोड से, फ़ोन पर।"
              : "Firebase AI Logic: Gemini Nano on the device and Gemini Flash in the cloud. Matching is always plain code, on the device."}
        </Item>
        <Item icon={<Database size={22} />} title={hi ? "सरकारी आँकड़े" : "Official data"}>
          {m ? (hi ? `CDSCO के ${m.records.toLocaleString("en-IN")} रिकॉर्ड, ${monthLabel(m.earliestMonth, lang)} से ${monthLabel(m.latestMonth, lang)} तक। कुछ राज्य हर महीने जानकारी नहीं भेजते।`
                    : `${m.records.toLocaleString("en-IN")} CDSCO records, ${monthLabel(m.earliestMonth, lang)} to ${monthLabel(m.latestMonth, lang)}. Some states do not report every month.`) : "CDSCO"}
        </Item>
      </Card>
      <p className="mt-5 text-center text-[14px] text-muted">Built with Cursor and Claude Code · MIT licence · #BuildHybridAI 2026</p>
      <Disclaimer className="mt-3" />
    </Page>
  );
}
