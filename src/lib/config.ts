// Which optional keys this build was given. Reports presence only, never values.
//
// Browser-visible keys (VITE_*) are read at build time and end up in the bundle,
// so only public values may use that prefix. The Sarvam and Gemini keys are used
// by maintainer scripts only (npm run audio / i18n / audio:gemini). They are never
// imported by src/, so they are not in the bundle and the app never needs them.
export interface KeyPresence {
  /** reCAPTCHA Enterprise site key for App Check on a hosted domain (needed for cloud AI and push). */
  appCheckSiteKey: boolean;
}

export function keyPresence(): KeyPresence {
  return {
    appCheckSiteKey: !!import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  };
}

/** False when this build has no App Check site key, so cloud AI and push need setup. The core offline check never needs it. */
export const cloudReady = (): boolean => keyPresence().appCheckSiteKey;
