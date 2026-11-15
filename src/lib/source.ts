// Where an AI answer came from. The SDK reports InferenceSource values
// "on_device" / "in_cloud" (lowercase). The spike compared against uppercase
// strings and showed "Unknown (on_device)". We compare against the SDK's own
// constants and only ever show one of two labels.
import type { Source } from "./types";

export const ON_DEVICE = "on_device";
export const IN_CLOUD = "in_cloud";

export function toSource(sdkValue: unknown, fallback: Source): Source {
  if (sdkValue === ON_DEVICE) return "device";
  if (sdkValue === IN_CLOUD) return "cloud";
  return fallback;
}

export function sourceLabel(v: Source | typeof ON_DEVICE | typeof IN_CLOUD, lang: "hi" | "en"): string {
  const device = v === "device" || v === ON_DEVICE;
  if (lang === "hi") return device ? "इसी फ़ोन पर" : "क्लाउड";
  return device ? "On this device" : "Cloud";
}
