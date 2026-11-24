export function BrandLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#F16F28" />
        <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
        <rect x="9" y="22" width="10" height="8" rx="2" fill="#242158" />
        <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
        <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F16F28" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.4px' }}>
        Workly
      </span>
    </div>
  );
}

export function HeroEditorialIllustration() {
  return (
    <svg
      viewBox="0 0 440 230"
      fill="none"
      style={{ width: '100%', maxWidth: '440px', marginTop: '28px', borderRadius: '16px' }}
    >
      {/* Bento Grid Background Tiles */}
      <rect x="0" y="0" width="190" height="110" rx="14" fill="#F16F28" />
      <rect x="202" y="0" width="238" height="110" rx="14" fill="#FFFFFF" />
      <rect x="0" y="122" width="250" height="108" rx="14" fill="#FFFFFF" />
      <rect x="262" y="122" width="178" height="108" rx="14" fill="#F16F28" />

      {/* Tile 1: Checklist Card */}
      <rect x="22" y="20" width="146" height="70" rx="10" fill="#FFFFFF" stroke="#242158" strokeWidth="2.5" />
      <circle cx="42" cy="42" r="8" fill="#F16F28" />
      <path d="M38.5 42L41 44.5L45.5 39.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <rect x="58" y="38" width="90" height="8" rx="4" fill="#242158" />
      <circle cx="42" cy="68" r="8" fill="#242158" />
      <rect x="58" y="64" width="70" height="8" rx="4" fill="#CBD5E1" />

      {/* Tile 2: Team Member Updating Dial */}
      <circle cx="265" cy="42" r="16" fill="#242158" />
      <path d="M240 96C240 76 251 64 265 64C279 64 290 76 290 96" fill="#F16F28" stroke="#242158" strokeWidth="2.5" />
      <rect x="315" y="26" width="102" height="58" rx="10" fill="#FFF2EB" stroke="#242158" strokeWidth="2.5" />
      <circle cx="344" cy="55" r="16" fill="#FFFFFF" stroke="#242158" strokeWidth="2.5" />
      <text x="335" y="59" fill="#242158" fontSize="11" fontWeight="800">98%</text>
      <polygon points="392,40 400,50 384,50" fill="#F16F28" />
      <polygon points="392,70 400,60 384,60" fill="#242158" />

      {/* Tile 3: Live Excel Sync Bars */}
      <rect x="24" y="144" width="120" height="14" rx="5" fill="#242158" />
      <rect x="24" y="168" width="200" height="12" rx="6" fill="#FFF2EB" />
      <rect x="24" y="168" width="145" height="12" rx="6" fill="#F16F28" />
      <rect x="24" y="190" width="200" height="12" rx="6" fill="#FFF2EB" />
      <rect x="24" y="190" width="180" height="12" rx="6" fill="#242158" />

      {/* Tile 4: Live Sync Badge */}
      <circle cx="351" cy="176" r="34" fill="#FFFFFF" stroke="#242158" strokeWidth="2.5" />
      <path d="M339 176L347 184L364 167" stroke="#F16F28" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function AdminBannerIllustration() {
  return (
    <svg width="180" height="110" viewBox="0 0 180 110" fill="none">
      {/* Control Board Bento */}
      <rect x="10" y="10" width="160" height="90" rx="14" fill="#FFFFFF" />
      <rect x="24" y="24" width="60" height="10" rx="5" fill="#242158" />
      <rect x="24" y="42" width="132" height="12" rx="6" fill="#FFF2EB" />
      <rect x="24" y="42" width="95" height="12" rx="6" fill="#F16F28" />
      <rect x="24" y="64" width="132" height="12" rx="6" fill="#FFF2EB" />
      <rect x="24" y="64" width="118" height="12" rx="6" fill="#242158" />
      <circle cx="144" cy="28" r="10" fill="#F16F28" />
      <path d="M140 28L143 31L149 25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function UserBannerIllustration() {
  return (
    <svg width="180" height="110" viewBox="0 0 180 110" fill="none">
      {/* Focus Workspace Bento */}
      <rect x="10" y="10" width="75" height="90" rx="14" fill="#F16F28" />
      <circle cx="47" cy="42" r="14" fill="#FFFFFF" />
      <path d="M27 84C27 68 36 60 47 60C58 60 67 68 67 84" fill="#242158" />
      <rect x="95" y="10" width="75" height="40" rx="10" fill="#FFFFFF" />
      <rect x="107" y="25" width="50" height="8" rx="4" fill="#242158" />
      <rect x="95" y="60" width="75" height="40" rx="10" fill="#FFFFFF" />
      <circle cx="115" cy="80" r="8" fill="#F16F28" />
      <rect x="129" y="76" width="30" height="8" rx="4" fill="#242158" />
    </svg>
  );
}

