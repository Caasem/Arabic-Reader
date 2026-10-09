/** Icons for the ink bar, the sketch panel and the dock (stroke icons in the quiet reader's style). */
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconPen = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
      <path d="M14 7l3 3" />
    </>
  );
export const IconMarker = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M9 15l-4 4h6l1-1" />
      <path d="M8 14l7-9 4 4-9 7z" />
    </>
  );
export const IconEraser = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M9 20h11" />
      <path d="M4.5 15.5l9-9 6 6-7.5 7.5H8.5z" />
    </>
  );
export const IconHand = ({ size = 16 }: { size?: number }) =>
  svg(size, <path d="M8 13V6.5a1.5 1.5 0 013 0V11M11 11V5a1.5 1.5 0 013 0v6M14 11V6.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-.5a6 6 0 01-5-2.7L3.6 14a1.5 1.5 0 012.5-1.6L8 15" />);
export const IconUndo = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </>
  );
export const IconRedo = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
    </>
  );
export const IconSketch = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 15c2-4 3 1 5-2s3 0 5-1" />
    </>
  );
export const IconSelect = ({ size = 16 }: { size?: number }) => svg(size, <path d="M6 3l13 8-6 1.6L10 19z" />);
export const IconLink = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="5.5" cy="6" r="2.5" />
      <circle cx="18.5" cy="18" r="2.5" />
      <path d="M7.5 7.8l9 8.4" />
    </>
  );
export const IconNode = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M12 9.5v5M9.5 12h5" />
    </>
  );
export const IconArrow = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 12h15M13 6l6 6-6 6" />);
export const IconQuote = ({ size = 16 }: { size?: number }) => svg(size, <path d="M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6" />);
export const IconTrash = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const IconExpand = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />);
export const IconClose = ({ size = 16 }: { size?: number }) => svg(size, <path d="M9 6l6 6-6 6" />);
