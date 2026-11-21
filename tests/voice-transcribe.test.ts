import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/firebase", () => ({ ai: {}, CLOUD_MODEL: "x", TRANSCRIBE_MODEL: "y" }));
const { transcribePrompt } = await import("../src/lib/ai");

describe("transcription prompt", () => {
  it("asks only for a transcript, never a decision", () => {
    for (const l of ["hi", "en", "pa", "gu", "mr", "kn", "ta"]) {
      const p = transcribePrompt(l);
      expect(p).toMatch(/only the transcript/);
      expect(p).not.toMatch(/safe|RED|AMBER|recall/i);
    }
    expect(transcribePrompt("kn")).toContain("Kannada");
  });
});
