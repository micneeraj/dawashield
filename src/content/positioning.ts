// "Why DawaShield" content. Competitor cells state only what their own public
// listings say (checked Nov 2026); anything we could not confirm is "not verified".
type T = { hi: string; en: string };

export const PILLARS: { title: T; body: T }[] = [
  { title: { hi: "बोलकर, भारतीय भाषा में", en: "Voice-first, in Indian languages" }, body: { hi: "हिन्दी और अंग्रेज़ी बिना इंटरनेट; पंजाबी, गुजराती, मराठी, कन्नड़, तमिल इंटरनेट के साथ। गड़बड़ भी सुनाई दे तो बड़े बटन से चुनिए।", en: "Hindi and English offline; Punjabi, Gujarati, Marathi, Kannada and Tamil online. A garbled transcript is matched to the closest medicine names and shown as large buttons." } },
  { title: { hi: "झूठा डर नहीं", en: "Careful about false alarms" }, body: { hi: "लाल तभी, जब बैच और कंपनी दोनों पक्के मिलें। उसी कंपनी की दूसरी दवा पर चेतावनी हो तो धूसर, साथ में 'यह चेतावनी एक अलग दवा की है, आपके बैच की नहीं'।", en: "RED only when batch and company both match with confidence. If only a different medicine from the same company is listed, it is GREY with \"This alert is for a different medicine, not your batch.\"" } },
  { title: { hi: "सस्ते फ़ोन पर, बिना इंटरनेट", en: "Works offline on cheap phones" }, body: { hi: "पूरी सरकारी सूची फ़ोन में। मिलान सादा कोड है, AI की ज़रूरत नहीं।", en: "The full official list lives on the phone. Matching is plain code; no AI needed." } },
  { title: { hi: "हर जवाब पर सरकारी स्रोत", en: "Official CDSCO data, source on every answer" }, body: { hi: "चेतावनी का महीना, सरकारी लिंक और रिकॉर्ड ID हर नतीजे पर।", en: "Alert month, official link and record ID on every result." } },
  { title: { hi: "घर की दवा पेटी, बाद में अपने-आप चेतावनी", en: "Home medicine cabinet with automatic later alerts" }, body: { hi: "सहेजी दवा रोज़ नई सूची से जाँची जाती है। सूचनाएँ भेजी जाती हैं, पर ऐप बंद होने पर भेजना अभी परखा नहीं गया।", en: "Saved medicines are re-checked daily against new lists. Notifications are sent, but closed-app delivery is not yet tested." } },
  { title: { hi: "परिवार को चेतावनी", en: "Family alerts" }, body: { hi: "WhatsApp संदेश, या बेटे-बेटी के फ़ोन पर सीधी सूचना।", en: "A WhatsApp message, or a push alert straight to a son's or daughter's phone." } },
  { title: { hi: "शिकायत लिखने में मदद", en: "Complaint-message helper" }, body: { hi: "CDSCO को भेजने लायक संदेश तैयार, CDSCO के सूचीबद्ध ईमेल और PRO टोल-फ़्री नंबर के साथ।", en: "A ready-to-send message for CDSCO, with CDSCO's listed contact email and PRO toll-free number." } },
  { title: { hi: "कोई विज्ञापन नहीं, कोई दवा नहीं सुझाता", en: "No ads, never recommends medicines" }, body: { hi: "हम कुछ नहीं बेचते और कभी कोई दूसरी दवा नहीं सुझाते।", en: "We sell nothing and never suggest any other medicine." } },
];

export type Cell = "yes" | "no" | "nv";
export const COMPETITORS = ["DawaShield", "FactsScan", "TruthIn", "Tata 1mg"] as const;

export const COMPARISON: { row: T; cells: [Cell, Cell, Cell, Cell] }[] = [
  { row: { hi: "मुख्य काम: दवा के बैच को CDSCO चेतावनी से मिलाना", en: "Main job: match a medicine batch to CDSCO alerts" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "पैक किए खाने के लेबल स्कैन करना", en: "Scans packaged-food labels" }, cells: ["no", "yes", "yes", "nv"] },
  { row: { hi: "दवा ऑनलाइन बेचना", en: "Sells medicines online" }, cells: ["no", "nv", "nv", "yes"] },
  { row: { hi: "हिन्दी में बोलकर जाँच", en: "Hindi voice check" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "पंजाबी, गुजराती, मराठी, कन्नड़, तमिल (इंटरनेट के साथ)", en: "Punjabi, Gujarati, Marathi, Kannada, Tamil (online)" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "बिना इंटरनेट पूरा मिलान", en: "Full matching offline" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "हर जवाब पर सरकारी स्रोत और रिकॉर्ड ID", en: "Official source + record ID on every answer" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "सहेजी दवा पर बाद में अपने-आप चेतावनी", en: "Automatic later alerts for saved medicines" }, cells: ["yes", "nv", "nv", "nv"] },
  { row: { hi: "कोई दवा नहीं सुझाता", en: "Never recommends medicines" }, cells: ["yes", "nv", "nv", "nv"] },
];

export const COMPARISON_NOTE: T = {
  hi: "हमें जो सार्वजनिक जानकारी मिली (नवंबर 2026 तक), उसी पर आधारित। 'जाँचा नहीं' का मतलब है हमने किसी भी तरफ़ पक्का नहीं किया। FactsScan और TruthIn खाने के लेबल वाले ऐप हैं; Tata 1mg ऑनलाइन फ़ार्मेसी है। ये अलग काम करते हैं, इसलिए यह दिखाता है कि DawaShield कहाँ अलग है, कौन बेहतर है यह नहीं।",
  en: "Based on the public listings we could find, as of November 2026. 'Not verified' means we did not confirm it either way. FactsScan and TruthIn are food-label apps; Tata 1mg is an online pharmacy. They do different jobs, so this shows where DawaShield is different, not who is better.",
};
