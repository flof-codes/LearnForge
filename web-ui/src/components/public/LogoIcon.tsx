export default function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="22" width="22" height="32" rx="4" fill="currentColor" opacity="0.25" />
      <rect x="24" y="14" width="22" height="32" rx="4" fill="currentColor" opacity="0.5" />
      <rect x="40" y="6" width="22" height="32" rx="4" fill="currentColor" opacity="0.75" />
      <line x1="46" y1="14" x2="56" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <line x1="46" y1="18" x2="54" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    </svg>
  );
}
