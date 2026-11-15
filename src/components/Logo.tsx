export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f7f72" />
          <stop offset="1" stopColor="#0c4743" />
        </linearGradient>
      </defs>
      <path d="M32 4 9 12.5v17.2C9 44.6 18.7 55.6 32 60c13.3-4.4 23-15.4 23-30.3V12.5L32 4Z" fill="url(#lg-shield)" />
      <path d="M32 9.5 14 16.2v13.5c0 11.6 7.4 20.4 18 24.4" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="2" />
      <g transform="rotate(-40 32 32)">
        <rect x="19" y="25" width="26" height="14" rx="7" fill="#fff" />
        <path d="M32 25h6a7 7 0 0 1 0 14h-6Z" fill="#f2c46d" />
      </g>
    </svg>
  );
}
