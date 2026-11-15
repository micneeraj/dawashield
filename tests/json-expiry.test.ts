import { describe, expect, it } from "vitest";
import { parseCandidates, parseModelJson, parseStripReading, stripFences } from "../src/lib/json";
import { expiryStatus, parseExpiry } from "../src/lib/expiry";
import { sourceLabel } from "../src/lib/source";

describe("model JSON", () => {
  it("parses JSON wrapped in ```json fences (spike bug 2)", () => {
    const raw = '```json\n{"name":"Dolo 650","batch":"DOBS3975","manufacturer":"Micro Labs","expiry":"12/2027"}\n```';
    expect(parseStripReading(raw)).toEqual({ name: "Dolo 650", batch: "DOBS3975", manufacturer: "Micro Labs", expiry: "12/2027" });
  });
  it("parses fences without a language tag and with chatter around", () => {
    expect(parseModelJson('Here you go:\n```\n{"a":1}\n```\nThanks')).toEqual({ a: 1 });
    expect(parseModelJson('Sure! {"a":2} hope this helps')).toEqual({ a: 2 });
  });
  it("rejects garbage and wrong shapes", () => {
    expect(parseStripReading("I cannot read this image")).toBeNull();
    expect(parseStripReading('["a","b"]')).toBeNull();
    expect(parseStripReading('{"name": null, "batch": "unknown"}')).toBeNull();
  });
  it("candidates schema", () => {
    expect(parseCandidates('```json\n{"candidates":["Dolo 650","Paracetamol"]}\n```')).toEqual(["Dolo 650", "Paracetamol"]);
    expect(parseCandidates('["A","A","B","C","D","E"]')).toEqual(["A", "B", "C", "D"]);
    expect(parseCandidates('{"candidates":"Dolo"}')).toBeNull();
  });
  it("stripFences leaves plain JSON alone", () => {
    expect(stripFences('{"x":1}')).toBe('{"x":1}');
  });
});

describe("inference source label (spike bug 1)", () => {
  it("maps SDK values exactly, never 'Unknown'", () => {
    expect(sourceLabel("on_device", "en")).toBe("On this device");
    expect(sourceLabel("in_cloud", "en")).toBe("Cloud");
    expect(sourceLabel("on_device", "hi")).toBe("इसी फ़ोन पर");
    expect(sourceLabel("in_cloud", "hi")).toBe("क्लाउड");
  });
});

describe("expiry", () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026
  it("parses common strip formats", () => {
    expect(parseExpiry("EXP 01/2028")?.getMonth()).toBe(0);
    expect(parseExpiry("Jan-2028")?.getFullYear()).toBe(2028);
    expect(parseExpiry("12/27")?.getFullYear()).toBe(2027);
    expect(parseExpiry("2027-03")?.getMonth()).toBe(2);
    expect(parseExpiry("garbage")).toBeNull();
  });
  it("valid / soon / expired", () => {
    expect(expiryStatus("Jan-2028", now)).toBe("valid");
    expect(expiryStatus("Nov-2026", now)).toBe("soon"); // valid till 30 Nov
    expect(expiryStatus("Oct-2026", now)).toBe("expired");
    expect(expiryStatus("", now)).toBe("unknown");
  });
});
