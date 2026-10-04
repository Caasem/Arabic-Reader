import type { ReactNode } from 'react';

/** Stroke icons for the reader, drawn on a 24px grid like the design. */
function Svg({ size = 18, width = 1.8, fill = 'none', children }: { size?: number; width?: number; fill?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconBackChevron = ({ size = 16 }: P) => (
  <Svg size={size} width={2}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);
export const IconChevronLeft = ({ size = 20 }: P) => (
  <Svg size={size}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);
export const IconChevronRight = ({ size = 20 }: P) => (
  <Svg size={size}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const IconChevronDown = ({ size = 14 }: P) => (
  <Svg size={size} width={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconList = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);
export const IconSearch = ({ size = 18 }: P) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconBookmark = ({ size = 18, filled = false }: P & { filled?: boolean }) => (
  <Svg size={size} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6 4h12v17l-6-4-6 4z" />
  </Svg>
);
export const IconWords = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
  </Svg>
);
export const IconLevels = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M6 20v-7M12 20V5M18 20v-10" />
  </Svg>
);
export const IconTimer = ({ size = 18 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 1.5M9 2h6" />
  </Svg>
);
export const IconFocus = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconSliders = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);
export const IconClose = ({ size = 16 }: P) => (
  <Svg size={size} width={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconPlus = ({ size = 14 }: P) => (
  <Svg size={size} width={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconCheck = ({ size = 17 }: P) => (
  <Svg size={size} width={2.2}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const IconPencil = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
);
export const IconCompare = ({ size = 17 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </Svg>
);
export const IconUpload = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </Svg>
);
export const IconTrash = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconJump = ({ size = 15 }: P) => (
  <Svg size={size} width={1.9}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Svg>
);
