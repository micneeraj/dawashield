/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
  readonly VITE_RECAPTCHA_V3_SITE_KEY?: string;
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
}
