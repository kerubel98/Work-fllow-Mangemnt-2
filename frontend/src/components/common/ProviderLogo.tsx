import React from 'react';

export type ProviderPresetType = 
  | 'MICROSOFT_365' 
  | 'TEAMS' 
  | 'GOOGLE_WORKSPACE' 
  | 'WHATSAPP' 
  | 'TELEGRAM' 
  | 'ZOHO' 
  | 'CUSTOM';

export interface ProviderLogoProps {
  preset?: string;
  channel?: string;
  logoUrl?: string;
  name?: string;
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP: Record<string, number> = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 32,
  xl: 40
};

export const ProviderLogo: React.FC<ProviderLogoProps> = ({
  preset,
  channel,
  logoUrl,
  name = 'Provider',
  size = 24,
  className = ''
}) => {
  const numericSize = typeof size === 'number' ? size : (SIZE_MAP[size] || 24);
  const sizeStyle: React.CSSProperties = {
    width: `${numericSize}px`,
    height: `${numericSize}px`,
    minWidth: `${numericSize}px`,
    minHeight: `${numericSize}px`,
    maxWidth: `${numericSize}px`,
    maxHeight: `${numericSize}px`,
    flexShrink: 0
  };

  // If custom logo URL is provided, render image with fallback
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={numericSize}
        height={numericSize}
        style={sizeStyle}
        className={`object-contain rounded-full shrink-0 ${className}`}
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
    );
  }

  const effectivePreset = (preset || '').toUpperCase();
  const effectiveChannel = (channel || '').toLowerCase();

  // 1. Microsoft 365 / Outlook
  if (
    effectivePreset === 'MICROSOFT_365' || 
    effectivePreset === 'OUTLOOK' ||
    (effectiveChannel === 'email' && (effectivePreset.includes('MICROSOFT') || effectivePreset.includes('365')))
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <rect width="24" height="24" rx="12" fill="#0078D4" />
        <rect x="5.5" y="5.5" width="6" height="6" rx="0.5" fill="#F25022" />
        <rect x="12.5" y="5.5" width="6" height="6" rx="0.5" fill="#7FBA00" />
        <rect x="5.5" y="12.5" width="6" height="6" rx="0.5" fill="#00A4EF" />
        <rect x="12.5" y="12.5" width="6" height="6" rx="0.5" fill="#FFB900" />
      </svg>
    );
  }

  // 2. Microsoft Teams
  if (
    effectivePreset === 'TEAMS' || 
    effectivePreset === 'MICROSOFT_TEAMS' ||
    effectiveChannel === 'teams'
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <rect width="24" height="24" rx="12" fill="#505AC9" />
        <path d="M14.5 9.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" fill="#B3B9F3" />
        <path d="M15.5 11h-2a1.5 1.5 0 0 0-1.5 1.5v3.25c0 .41.34.75.75.75h3.5a.75.75 0 0 0 .75-.75v-3.25A1.5 1.5 0 0 0 15.5 11Z" fill="#B3B9F3" />
        <circle cx="9.5" cy="8.25" r="2.25" fill="#FFFFFF" />
        <path d="M11.5 11.5H7.5A2 2 0 0 0 5.5 13.5V17a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-3.5a2 2 0 0 0-1-1.5Z" fill="#FFFFFF" />
      </svg>
    );
  }

  // 3. Google Workspace / Gmail
  if (
    effectivePreset === 'GOOGLE_WORKSPACE' || 
    effectivePreset === 'GOOGLE' || 
    effectivePreset === 'GMAIL'
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <rect width="24" height="24" rx="12" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
        <path d="M5.5 17.5V8.8l6.5 4.9 6.5-4.9v8.7a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5Z" fill="#EA4335" />
        <path d="M18.5 7.8v1L12 13.7 5.5 8.8v-1a.8.8 0 0 1 1.3-.6L12 11l5.2-3.8a.8.8 0 0 1 1.3.6Z" fill="#FBBC04" />
        <path d="M5.5 7.5a.8.8 0 0 1 1.3-.6L12 11 5.5 15.9V7.5Z" fill="#4285F4" />
        <path d="M18.5 7.5a.8.8 0 0 0-1.3-.6L12 11l6.5 4.9V7.5Z" fill="#34A853" />
      </svg>
    );
  }

  // 4. WhatsApp
  if (
    effectivePreset === 'WHATSAPP' || 
    effectivePreset === 'WHATSAPP_BUSINESS' || 
    effectiveChannel === 'whatsapp'
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <circle cx="12" cy="12" r="12" fill="#25D366" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 4.5a7.5 7.5 0 0 0-6.4 11.4L4.5 19.5l3.8-1a7.5 7.5 0 1 0 3.7-14Zm4.4 10.3c-.2.5-.9 1-1.5 1.1-.4.1-.9.2-2.9-.6-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.8-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .5.4.2.5.7 1.7.7 1.8.1.1.1.3 0 .5s-.2.3-.3.4l-.4.5c-.1.1-.3.3-.1.6.2.4.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.9 1.8.3.1.5.1.7-.1.2-.3.7-.9.9-1.2.2-.3.4-.2.7-.1.3.1 1.7.8 2 .9.3.2.5.3.6.4.1.2.1 1-.1 1.5Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  // 5. Telegram
  if (
    effectivePreset === 'TELEGRAM' || 
    effectiveChannel === 'telegram'
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <circle cx="12" cy="12" r="12" fill="#229ED9" />
        <path
          d="M17.8 7.2 5.8 11.8c-.8.3-.8.8-.2 1l3 1 7.2-4.5c.3-.2.6-.1.4.1l-5.8 5.2-.2 3.3c.3 0 .5-.1.7-.3l1.7-1.6 3.5 2.6c.6.4 1.1.2 1.3-.6l2.3-10.8c.2-.9-.3-1.3-.9-1Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  // 6. Zoho
  if (
    effectivePreset === 'ZOHO' || 
    effectivePreset.includes('ZOHO')
  ) {
    return (
      <svg width={numericSize} height={numericSize} style={sizeStyle} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
        <rect width="24" height="24" rx="12" fill="#0F142A" />
        <rect x="5.5" y="5.5" width="5.5" height="5.5" rx="1" fill="#E42527" />
        <rect x="13" y="5.5" width="5.5" height="5.5" rx="1" fill="#00823F" />
        <rect x="5.5" y="13" width="5.5" height="5.5" rx="1" fill="#1C51A1" />
        <rect x="13" y="13" width="5.5" height="5.5" rx="1" fill="#F9B217" />
      </svg>
    );
  }

  // Fallback: Clean circular badge with initials
  const initials = (name || 'PR').substring(0, 2).toUpperCase();
  return (
    <div
      style={sizeStyle}
      className={`rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-[10px] font-mono shadow-2xs shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
};
