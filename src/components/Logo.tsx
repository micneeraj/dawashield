import { useId } from "react";

/** Indigo + violet shield with a capsule. Colours come from theme.css. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const id = `lg-shield-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent-strong)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand)" }} />
        </linearGradient>
      </defs>
      <path d="M32 4 9 12.5v17.2C9 44.6 18.7 55.6 32 60c13.3-4.4 23-15.4 23-30.3V12.5L32 4Z" fill={`url(#${id})`} />
      <path d="M32 9.5 14 16.2v13.5c0 11.6 7.4 20.4 18 24.4" fill="none" style={{ stroke: "var(--card)" }} strokeOpacity=".18" strokeWidth="2" />
      <g transform="rotate(-40 32 32)">
        <rect x="19" y="25" width="26" height="14" rx="7" style={{ fill: "var(--card)" }} />
        <path d="M32 25h6a7 7 0 0 1 0 14h-6Z" style={{ fill: "var(--violet-300)" }} />
      </g>
    </svg>
  );
}
