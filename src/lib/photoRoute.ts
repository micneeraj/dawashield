// Which AI reads a strip photo. Plain code, no AI, no matching.
//
//   online                      -> cloud (Gemini Flash); if that fails and Nano is available, Nano
//   offline + Nano available    -> on-device Gemini Nano, in every UI language
//   offline + Nano not available -> honest "on-device AI isn't available" message (never "no internet")
//
// Chrome reports Nano as "available", "downloadable", "downloading" or "unavailable".
// Only "available" can be used offline: a download needs the internet.

export type NanoStatus = "available" | "downloadable" | "downloading" | "unavailable" | "unknown";
export type PhotoRoute = "cloud" | "device" | "unavailable";

/** Map Chrome's LanguageModel.availability() answer (including the older names) to our status. */
export function nanoStatusFrom(raw: string | null | undefined): NanoStatus {
  switch (raw) {
    case "available":
    case "readily": return "available";
    case "downloadable":
    case "after-download": return "downloadable";
    case "downloading": return "downloading";
    case "unavailable":
    case "no": return "unavailable";
    default: return "unknown";
  }
}

/** The first route to try for one photo. */
export function photoRoute(online: boolean, nano: NanoStatus): PhotoRoute {
  if (online) return "cloud";
  return nano === "available" ? "device" : "unavailable";
}

/** After a failed cloud read while online: fall back to Nano only when it is really available. */
export function afterCloudFailure(nano: NanoStatus): "device" | "rethrow" {
  return nano === "available" ? "device" : "rethrow";
}
