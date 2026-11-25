import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/firebase", () => ({ ai: {}, CLOUD_MODEL: "x", TRANSCRIBE_MODEL: "y" }));
const { nanoStatusFrom, photoRoute, afterCloudFailure } = await import("../src/lib/photoRoute");
const { photoErrorKey, RECOVERY } = await import("../src/lib/errors");
const { ERRORS } = await import("../src/content/messages");
const { readStrip, OnDeviceUnavailable } = await import("../src/lib/ai");

describe("Chrome's Nano availability answer", () => {
  it("maps the current and the older names", () => {
    expect(nanoStatusFrom("available")).toBe("available");
    expect(nanoStatusFrom("readily")).toBe("available");
    expect(nanoStatusFrom("downloadable")).toBe("downloadable");
    expect(nanoStatusFrom("after-download")).toBe("downloadable");
    expect(nanoStatusFrom("downloading")).toBe("downloading");
    expect(nanoStatusFrom("unavailable")).toBe("unavailable");
    expect(nanoStatusFrom("no")).toBe("unavailable");
    expect(nanoStatusFrom(undefined)).toBe("unknown");
  });
});

describe("which AI reads a photo (decision table)", () => {
  it("online always goes to the cloud first, whatever Nano says", () => {
    for (const n of ["available", "downloadable", "unavailable", "unknown"] as const) expect(photoRoute(true, n)).toBe("cloud");
  });

  it("offline + Nano available -> on-device Nano", () => {
    expect(photoRoute(false, "available")).toBe("device");
  });

  it("offline + Nano not available -> honest unavailable (never a cloud call)", () => {
    for (const n of ["downloadable", "downloading", "unavailable", "unknown"] as const) expect(photoRoute(false, n)).toBe("unavailable");
  });

  it("after a failed cloud read: Nano only when it is really available", () => {
    expect(afterCloudFailure("available")).toBe("device");
    expect(afterCloudFailure("downloadable")).toBe("rethrow");
    expect(afterCloudFailure("unknown")).toBe("rethrow");
  });
});

describe("error message for a photo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("an on-device unavailable error shows the honest message, even offline", () => {
    expect(photoErrorKey(new OnDeviceUnavailable(), false)).toBe("onDeviceUnavailable");
    expect(photoErrorKey(new Error("on-device-unavailable"), true)).toBe("onDeviceUnavailable");
  });

  it("an on-device read failure is 'could not be read', not 'no internet'", () => {
    expect(photoErrorKey(new Error("on-device-failed"), false)).toBe("photoUnreadable");
  });

  it("a real offline fetch error still says no internet (unchanged)", () => {
    expect(photoErrorKey(new Error("Failed to fetch"), false)).toBe("network");
  });

  it("the honest message exists in Hindi and English and offers the typing recovery", () => {
    expect(ERRORS.onDeviceUnavailable.en).toBe("On-device AI isn't available on this device. Type the batch instead, the check still works offline.");
    expect(ERRORS.onDeviceUnavailable.hi.length).toBeGreaterThan(20);
    expect(ERRORS.onDeviceUnavailable.hi).not.toMatch(/इंटरनेट नहीं/);
    expect(RECOVERY.onDeviceUnavailable).toContain("type");
  });
});

describe("readStrip wiring", () => {
  it("offline with no Nano: throws the honest error and never calls the cloud", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("self", globalThis); // no LanguageModel in this environment
    await expect(readStrip(new Blob(["x"], { type: "image/jpeg" }))).rejects.toBeInstanceOf(OnDeviceUnavailable);
    vi.unstubAllGlobals();
  });
});
