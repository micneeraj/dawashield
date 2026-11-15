// Firebase app, App Check and Firebase AI Logic. Config reused from the spike.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from "firebase/app-check";
import { getAI, GoogleAIBackend } from "firebase/ai";

// Firebase web config (public by design).
export const firebaseConfig = {
  projectId: "dawashield-hybrid-3023",
  appId: "1:544648186921:web:cd58fa0d56cf21bc38a038",
  storageBucket: "dawashield-hybrid-3023.firebasestorage.app",
  apiKey: "AIzaSyC6hXAUAauCyxZElbJLvFp_RKMyK0uqXUk",
  authDomain: "dawashield-hybrid-3023.firebaseapp.com",
  messagingSenderId: "544648186921",
  measurementId: "G-QKCDPFSW2N",
};

export const app = initializeApp(firebaseConfig);

// App Check: Firebase AI Logic rejects requests without a valid token.
// localhost  -> debug provider (as in the spike). A fixed registered debug token
//               can be given in .env.local as VITE_APPCHECK_DEBUG_TOKEN; otherwise
//               Chrome prints a fresh token in the console to register.
// hosted     -> reCAPTCHA (v3 site key, or an Enterprise key if that is what is set).
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocal) {
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}
const V3_KEY = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined;
const ENT_KEY = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined;
export const appCheckReady = isLocal || !!V3_KEY || !!ENT_KEY;
try {
  initializeAppCheck(app, {
    provider: ENT_KEY
      ? new ReCaptchaEnterpriseProvider(ENT_KEY)
      : new ReCaptchaV3Provider(V3_KEY || "app-check-key-not-configured"),
    isTokenAutoRefreshEnabled: true,
  });
} catch (e) {
  console.warn("App Check not started", e);
}

export const ai = getAI(app, { backend: new GoogleAIBackend() });
export const CLOUD_MODEL = "gemini-3.5-flash";
