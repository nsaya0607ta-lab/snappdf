import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5.14v13.72a.6.6 0 0 0 .92.5l10.7-6.86a.6.6 0 0 0 0-1l-10.7-6.86a.6.6 0 0 0-.92.5Z" />
  </svg>
);

export const IconPause = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
  </svg>
);

export const IconStop = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.4" />
  </svg>
);

export const IconPrev = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M7 5.5a1 1 0 0 1 2 0v5.06l8.5-5.44a.6.6 0 0 1 .92.5v12.76a.6.6 0 0 1-.92.5L9 13.44V18.5a1 1 0 1 1-2 0Z" />
  </svg>
);

export const IconNext = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M17 5.5a1 1 0 0 0-2 0v5.06L6.5 5.12a.6.6 0 0 0-.92.5v12.76a.6.6 0 0 0 .92.5L15 13.44V18.5a1 1 0 1 0 2 0Z" />
  </svg>
);

export const IconShuffle = (p: P) => (
  <Base {...p}>
    <path d="M3 6h3.5c1.2 0 2.3.6 3 1.6l5 7.3c.7 1 1.8 1.6 3 1.6H21" />
    <path d="M3 17.7h3.5c1.2 0 2.3-.6 3-1.6l.8-1.2" />
    <path d="M14.2 8.5l.8-1.2c.7-1 1.8-1.6 3-1.6H21" />
    <path d="M18.5 3.2 21 5.7l-2.5 2.5" />
    <path d="M18.5 14.7 21 17.2l-2.5 2.5" />
  </Base>
);

export const IconRepeat = (p: P) => (
  <Base {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 12V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 12v2.5a3.5 3.5 0 0 1-3.5 3.5H3.5" />
  </Base>
);

export const IconRepeatOne = (p: P) => (
  <Base {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 12V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 12v2.5a3.5 3.5 0 0 1-3.5 3.5H3.5" />
    <path d="M11.2 10.4 12.6 9.6V15" strokeWidth={1.9} />
  </Base>
);

export const IconVolume = ({ level = 2, ...p }: P & { level?: 0 | 1 | 2 }) => (
  <Base {...p}>
    <path d="M4 9.5h3L11.4 6a.6.6 0 0 1 1 .5v11a.6.6 0 0 1-1 .5L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    {level === 0 ? (
      <>
        <path d="M16.5 9.8 21 14.3" />
        <path d="M21 9.8l-4.5 4.5" />
      </>
    ) : (
      <>
        <path d="M16.2 9.4a3.8 3.8 0 0 1 0 5.2" />
        {level === 2 && <path d="M18.9 7a7.3 7.3 0 0 1 0 10" />}
      </>
    )}
  </Base>
);

export const IconHeart = ({ filled = false, ...p }: P & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  >
    <path d="M12 20.3s-7.6-4.6-7.6-9.7A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.6 3c0 5.1-7.6 9.7-7.6 9.7Z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Base>
);

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
    <path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </Base>
);

export const IconLibrary = (p: P) => (
  <Base {...p}>
    <path d="M4 4.5v15M8.5 4.5v15" />
    <path d="m13.5 5.4 4.6 14.2a.8.8 0 0 0 1 .5l1.4-.5a.8.8 0 0 0 .5-1L16.4 4.4a.8.8 0 0 0-1-.5l-1.4.5a.8.8 0 0 0-.5 1Z" />
  </Base>
);

export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.2V12l3.2 2" />
  </Base>
);

export const IconList = (p: P) => (
  <Base {...p}>
    <path d="M4 6.5h10M4 12h10M4 17.5h6" />
    <circle cx="17.5" cy="16.5" r="2.5" />
    <path d="M20 16.5V8.2l-2.5.8" />
  </Base>
);

export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconSun = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Base>
);

export const IconMoon = (p: P) => (
  <Base {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  </Base>
);

export const IconTimer = (p: P) => (
  <Base {...p}>
    <path d="M9.5 2.6h5" />
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.8v3.7l2.4 1.6" />
  </Base>
);

export const IconKeyboard = (p: P) => (
  <Base {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.4" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 9.5h.01M18 13h.01M9 13h6" />
  </Base>
);

export const IconReset = (p: P) => (
  <Base {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.2 4.2v4.4h4.4" />
  </Base>
);

export const IconGrip = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

export const IconMusic = (p: P) => (
  <Base {...p}>
    <path d="M9 18V6.4l10-2v11.2" />
    <circle cx="6.6" cy="18" r="2.6" />
    <circle cx="16.6" cy="15.6" r="2.6" />
  </Base>
);

export const IconSliders = (p: P) => (
  <Base {...p}>
    <path d="M4 6.5h10M18.5 6.5H20M4 12h2M10.5 12H20M4 17.5h8M16.5 17.5H20" />
    <circle cx="16" cy="6.5" r="2.2" />
    <circle cx="8.2" cy="12" r="2.2" />
    <circle cx="14.2" cy="17.5" r="2.2" />
  </Base>
);

export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);

export const IconEdit = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Base>
);
