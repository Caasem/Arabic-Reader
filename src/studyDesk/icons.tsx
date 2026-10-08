const s = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconInbox = () => (
  <svg {...s}>
    <path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" />
  </svg>
);
export const IconConcept = () => (
  <svg {...s}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconCapture = () => (
  <svg {...s}>
    <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
export const IconPull = () => (
  <svg {...s}>
    <path d="M14 4h6v6M20 4l-8 8M10 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </svg>
);
export const IconUp = () => (
  <svg {...s}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const IconDown = () => (
  <svg {...s}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconEye = () => (
  <svg {...s}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconEyeOff = () => (
  <svg {...s}>
    <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.7C3.7 8.6 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.4-1" />
  </svg>
);
export const IconChevron = ({ left }: { left?: boolean }) => (
  <svg {...s}>
    <path d={left ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);
