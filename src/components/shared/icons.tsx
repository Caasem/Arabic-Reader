/**
 * Shared outline-icon set — replaces the emoji/text glyphs (📚 📖 🔤 ✎ ◐ ⚙ ‹ › ×)
 * that used to stand in for real iconography, so the nav bar, the reader
 * chrome, and the vocabulary panel all speak one consistent visual language.
 * Stroke weight (1.6-1.8) and rounded caps/joins match the concept designs.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function IconLibrary({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M14 4v5h5" />
    </svg>
  );
}

export function IconRead({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 6.5C10.5 5 8 4 4 4v14c4 0 6.5 1 8 2.5C13.5 19 16 18 20 18V4c-4 0-6.5 1-8 2.5Z" />
      <path d="M12 6.5v14" />
    </svg>
  );
}

export function IconSpeedReader({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export function IconVocabLevels({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 19V5" />
      <path d="M9 19v-8" />
      <path d="M14 19V9" />
      <path d="M19 19V4" />
    </svg>
  );
}

export function IconVocabulary({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 4h11a1 1 0 0 1 1 1v15l-6.5-3.5L5 20V5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function IconHighlights({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m12 20 7-7-3-3-7 7v3h3Z" />
      <path d="m15.5 6.5 2 2" />
      <path d="M5 21h4" />
    </svg>
  );
}

export function IconReview({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function IconSettings({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.9a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3.1a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.2a1.7 1.7 0 0 0 1-1.55V3.1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9.2a1.7 1.7 0 0 0 1.55 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

export function IconChevronLeft({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}

export function IconChevronRight({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconClose({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconTrash({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function IconBack({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M11 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      <path d="m14 15 5-5-5-5" />
      <path d="M19 10H9" />
    </svg>
  );
}

export function IconFocus({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3 8V5a2 2 0 0 1 2-2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEdit({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconSearch({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconCheck({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconDashboard({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconFlame({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c1 1 2 3 2 5a6 6 0 1 1-12 0c0-4 3-6 4-9 .5 1 1 2 2 3Z" />
    </svg>
  );
}

export function IconContents({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

/** Outline ribbon/flag -- an unbookmarked location, or the "add bookmark"
 * action. */
export function IconBookmark({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 4h12v16l-6-4.2L6 20V4Z" />
    </svg>
  );
}

/** Filled ribbon/flag -- a location that already has a bookmark. Distinct
 * shape (filled vs outline), not colour alone, so it reads correctly for
 * anyone who can't rely on colour to tell the two apart. */
export function IconBookmarkFilled({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" stroke="none" {...rest}>
      <path d="M6 4h12v16l-6-4.2L6 20V4Z" />
    </svg>
  );
}
