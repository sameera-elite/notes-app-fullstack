import React from 'react';

/**
 * Common SVG Icon Wrapper
 * Provides consistent outline styling, responsive dimensions, and accessibility attributes.
 */
function SvgIcon({
  size = '1em',
  className = '',
  color = 'currentColor',
  strokeWidth = 2,
  title,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  children,
  viewBox = '0 0 24 24',
  style,
  ...props
}) {
  const isAriaHidden = ariaHidden !== undefined ? ariaHidden : !title && !ariaLabel;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`app-icon ${className}`.trim()}
      aria-hidden={isAriaHidden}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.125em',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Core Application Icons
// -----------------------------------------------------------------------------

export function NoteVaultLogo({
  size = '64px',
  className = '',
  title = 'NoteVault Logo',
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={`app-icon notevault-logo ${className}`.trim()}
      aria-label={title}
      role="img"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
      {...props}
    >
      {title && <title>{title}</title>}
      {/* Navy Shield Base */}
      <path
        d="M 32 5 C 37 7 46 9 51 11 C 53 16 54 22 53 28 C 51 41 42 52 32 59 C 22 52 13 41 11 28 C 10 22 11 16 13 11 C 18 9 27 7 32 5 Z"
        fill="#163f70"
        stroke="#7ce2d6"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* Infinity Symbol (Cyan with Lime Accent) */}
      <path
        d="M 32 29 C 27 21 17 21 17 29 C 17 37 27 37 32 29 C 37 21 47 21 47 29 C 47 37 37 37 32 29 Z"
        stroke="#22a4e2"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 32 29 C 27 21 17 21 17 29 C 17 37 27 37 32 29 C 37 21 47 21 47 29 C 47 37 37 37 32 29 Z"
        stroke="#82db59"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Heartbeat ECG Pulse Line */}
      <path
        d="M 20 44 L 27 44 L 29 42 L 31 46 L 33 38 L 35 48 L 37 42 L 39 44 L 44 44"
        stroke="#82db59"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NoteIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </SvgIcon>
  );
}

export function SettingsIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </SvgIcon>
  );
}

export function LockIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgIcon>
  );
}

export function UnlockIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </SvgIcon>
  );
}

export function PinIcon({ filled = false, ...props }) {
  return (
    <SvgIcon {...props}>
      {filled ? (
        <>
          <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5 17h14l-1.5-6V5h1V3H5.5v2h1v6L5 17z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      ) : (
        <>
          <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5 17h14l-1.5-6V5h1V3H5.5v2h1v6L5 17z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </SvgIcon>
  );
}

export function StarIcon({ filled = false, ...props }) {
  return (
    <SvgIcon {...props}>
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

export function SearchIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </SvgIcon>
  );
}

export function ImageIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </SvgIcon>
  );
}

export function EditIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </SvgIcon>
  );
}

export function TrashIcon(props) {
  return (
    <SvgIcon {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </SvgIcon>
  );
}

export function CheckIcon(props) {
  return (
    <SvgIcon {...props}>
      <polyline points="20 6 9 17 4 12" />
    </SvgIcon>
  );
}

export function CloseIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </SvgIcon>
  );
}

export function EyeIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </SvgIcon>
  );
}

export function EyeOffIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </SvgIcon>
  );
}

export function KeyIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l2 2" />
      <path d="M18.5 4.5l2 2" />
    </SvgIcon>
  );
}

export function TimerIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="17.5" y1="3.5" x2="19" y2="5" />
    </SvgIcon>
  );
}

export function WarningIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </SvgIcon>
  );
}

export function AlertIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </SvgIcon>
  );
}

export function LightningIcon(props) {
  return (
    <SvgIcon {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </SvgIcon>
  );
}

export function DiceIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function InfoIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </SvgIcon>
  );
}

export function ExternalLinkIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </SvgIcon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </SvgIcon>
  );
}

export function PlusIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </SvgIcon>
  );
}

export function UndoIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </SvgIcon>
  );
}

export function RedoIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </SvgIcon>
  );
}

export function ListBulletIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth={3} />
      <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth={3} />
      <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth={3} />
    </SvgIcon>
  );
}

export function ListOrderedIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </SvgIcon>
  );
}

export function ClearFormatIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7V4h16v3" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="2" y1="2" x2="22" y2="22" strokeWidth={1.5} />
    </SvgIcon>
  );
}

// -----------------------------------------------------------------------------
// Theme Switcher Icons
// -----------------------------------------------------------------------------

export function SunIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </SvgIcon>
  );
}

export function MoonIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </SvgIcon>
  );
}

export function FlowerIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2a4 4 0 0 0-3.8 2.7 4 4 0 0 0-4.5 4.5A4 4 0 0 0 2 12a4 4 0 0 0 1.7 3.3 4 4 0 0 0 4.5 4.5A4 4 0 0 0 12 22a4 4 0 0 0 3.8-2.7 4 4 0 0 0 4.5-4.5A4 4 0 0 0 22 12a4 4 0 0 0-1.7-3.3 4 4 0 0 0-4.5-4.5A4 4 0 0 0 12 2z" />
    </SvgIcon>
  );
}

export function LeafIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M11 20A7 7 0 0 1 4 13C4 7 11 3 20 3c0 9-4 16-9 17z" />
      <path d="M7 17l9-9" />
    </SvgIcon>
  );
}

export function MonitorIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </SvgIcon>
  );
}

export function SpinnerIcon({ size = '1em', className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`app-icon app-icon-spinner ${className}`.trim()}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        verticalAlign: '-0.125em',
        animation: 'spin 1s linear infinite',
      }}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Empty State Illustrative Graphics
// -----------------------------------------------------------------------------

export function EmptyNotesIllustration({ size = '3.5rem', className = '', ...props }) {
  return (
    <SvgIcon
      viewBox="0 0 64 64"
      size={size}
      className={`empty-state-svg ${className}`.trim()}
      strokeWidth={1.5}
      {...props}
    >
      <rect x="14" y="8" width="36" height="48" rx="4" ry="4" />
      <line x1="22" y1="20" x2="42" y2="20" />
      <line x1="22" y1="28" x2="42" y2="28" />
      <line x1="22" y1="36" x2="34" y2="36" />
      <circle cx="46" cy="46" r="10" fill="var(--bg-card, #ffffff)" stroke="currentColor" />
      <line x1="46" y1="41" x2="46" y2="51" />
      <line x1="41" y1="46" x2="51" y2="46" />
    </SvgIcon>
  );
}

export function EmptyFavoritesIllustration({ size = '3.5rem', className = '', ...props }) {
  return (
    <SvgIcon
      viewBox="0 0 64 64"
      size={size}
      className={`empty-state-svg ${className}`.trim()}
      strokeWidth={1.5}
      {...props}
    >
      <polygon
        points="32 10 39 25 56 27 43 39 46 56 32 48 18 56 21 39 8 27 25 25 32 10"
        fill="none"
        stroke="currentColor"
      />
      <circle cx="32" cy="33" r="3" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function EmptySearchIllustration({ size = '3.5rem', className = '', ...props }) {
  return (
    <SvgIcon
      viewBox="0 0 64 64"
      size={size}
      className={`empty-state-svg ${className}`.trim()}
      strokeWidth={1.5}
      {...props}
    >
      <circle cx="28" cy="28" r="18" />
      <line x1="42" y1="42" x2="56" y2="56" strokeWidth={3} />
      <line x1="23" y1="28" x2="33" y2="28" strokeLinecap="round" />
    </SvgIcon>
  );
}
