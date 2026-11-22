import { describe, expect, it, beforeEach } from "vitest";
import { CALL_LABEL, cleanPhone, dayPart, getContacts, greeting, languageTiles, saveContacts, showCallButtons, telHref } from "../src/lib/profile";

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

describe("Call buttons", () => {
  beforeEach(() => store.clear());
  it("show on RED and AMBER only, never GREY or unreadable", () => {
    expect(showCallButtons("RED")).toBe(true);
    expect(showCallButtons("AMBER")).toBe(true);
    expect(showCallButtons("GREY")).toBe(false);
    expect(showCallButtons("UNREADABLE")).toBe(false);
  });
  it("unsaved number gives no tel link (opens Add number)", () => {
    expect(telHref({}, "doctor")).toBeNull();
  });
  it("saved number becomes a tel: link, stored on device", () => {
    saveContacts({ doctor: "98765 43210", familyName: " Neeraj ", family: "+91-98111-22233" });
    const c = getContacts();
    expect(telHref(c, "doctor")).toBe("tel:9876543210");
    expect(telHref(c, "family")).toBe("tel:+919811122233");
    expect(c.familyName).toBe("Neeraj");
    expect(telHref(c, "chemist")).toBeNull();
  });
  it("rejects implausible numbers", () => {
    expect(cleanPhone("123")).toBe("");
    expect(cleanPhone("abc")).toBe("");
    expect(cleanPhone("1234567890123456")).toBe("");
  });
  it("has the exact Hindi and English labels", () => {
    expect(CALL_LABEL.family.hi).toBe("परिवार को कॉल करें");
    expect(CALL_LABEL.doctor.hi).toBe("डॉक्टर को कॉल करें");
    expect(CALL_LABEL.chemist.hi).toBe("केमिस्ट को कॉल करें");
    expect([CALL_LABEL.family.en, CALL_LABEL.doctor.en, CALL_LABEL.chemist.en]).toEqual(["Call family", "Call doctor", "Call chemist"]);
  });
});

describe("Greeting", () => {
  const at = (h: number) => new Date(2026, 10, 22, h, 0);
  it("picks morning / afternoon / evening", () => {
    expect(dayPart(7)).toBe("morning");
    expect(dayPart(13)).toBe("afternoon");
    expect(dayPart(20)).toBe("evening");
    expect(dayPart(2)).toBe("evening");
  });
  it("adds the chosen name in both languages", () => {
    expect(greeting("hi", "माँ", at(8))).toBe("सुप्रभात, माँ");
    expect(greeting("en", "Maa", at(8))).toBe("Good morning, Maa");
    expect(greeting("en", "Papa", at(15))).toBe("Good afternoon, Papa");
    expect(greeting("en", "", at(19))).toBe("Good evening");
  });
});

describe("Language screen tiles", () => {
  it("Hindi and English always active, each in its own script", () => {
    const t = languageTiles({});
    expect(t.slice(0, 2).map((x) => [x.native, x.active])).toEqual([["हिन्दी", true], ["English", true]]);
  });
  it("regional tiles show Coming soon until the manifest switches them on", () => {
    const off = languageTiles({});
    expect(off.slice(2).map((x) => x.native)).toEqual(["ਪੰਜਾਬੀ", "ગુજરાતી", "मराठी", "ಕನ್ನಡ", "தமிழ்"]);
    expect(off.slice(2).every((x) => !x.active && x.note === "soon")).toBe(true);
    const on = languageTiles({ pa: true });
    expect(on.find((x) => x.lang === "pa")).toMatchObject({ active: true, note: "online" });
    expect(on.find((x) => x.lang === "ta")).toMatchObject({ active: false, note: "soon" });
  });
});
