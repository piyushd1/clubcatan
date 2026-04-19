/**
 * Lightweight inline-SVG icon set. We don't pull Material Symbols because:
 *  - It's 200+ KB of glyph data.
 *  - We only need ~15 icons across the app.
 *  - Inline SVG ships with the precache and always renders (no FOUC).
 *
 * Each component accepts `size` (default 20) and passes through any SVG props.
 * `stroke-linecap="round"` + `linejoin="round"` matches the naturalist aesthetic.
 */
function base(d, size, props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {d}
    </svg>
  );
}

export const Icons = {
  Play: ({ size = 20, ...p }) => base(<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />, size, p),
  ArrowLeft: ({ size = 20, ...p }) => base(<><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>, size, p),
  Copy: ({ size = 20, ...p }) => base(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, size, p),
  Check: ({ size = 20, ...p }) => base(<polyline points="20 6 9 17 4 12" />, size, p),
  Clock: ({ size = 20, ...p }) => base(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>, size, p),
  Settings: ({ size = 20, ...p }) => base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, size, p),
  Dice: ({ size = 20, ...p }) => base(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.25" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1.25" fill="currentColor" stroke="none" /></>, size, p),
  Hammer: ({ size = 20, ...p }) => base(<><path d="M14 4l6 6-4 4-6-6z" /><path d="M10 8l-7 7 3 3 7-7" /></>, size, p),
  Swap: ({ size = 20, ...p }) => base(<><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>, size, p),
  Cards: ({ size = 20, ...p }) => base(<><rect x="3" y="6" width="12" height="16" rx="2" transform="rotate(-8 9 14)" /><rect x="9" y="4" width="12" height="16" rx="2" /></>, size, p),
  People: ({ size = 20, ...p }) => base(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, size, p),
  Grid: ({ size = 20, ...p }) => base(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>, size, p),
  Home: ({ size = 20, ...p }) => base(<><path d="M3 11l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" /></>, size, p),
  Book: ({ size = 20, ...p }) => base(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v3H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 1 4 14.5v-10A2.5 2.5 0 0 1 6.5 2z" /></>, size, p),
  X: ({ size = 20, ...p }) => base(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>, size, p),
  UserPlus: ({ size = 20, ...p }) => base(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>, size, p),

  // ---- Resource glyphs (#9). Each draws in currentColor so a parent
  // text-secondary / text-primary tint cascades onto the icon. Keep lines
  // simple — these render at 14-20px.
  // Brick: a stacked wall.
  Brick: ({ size = 20, ...p }) => base(
    <><rect x="3" y="5" width="18" height="5" rx="1" /><rect x="3" y="14" width="18" height="5" rx="1" /><line x1="9" y1="5" x2="9" y2="10" /><line x1="15" y1="5" x2="15" y2="10" /><line x1="6" y1="14" x2="6" y2="19" /><line x1="12" y1="14" x2="12" y2="19" /><line x1="18" y1="14" x2="18" y2="19" /></>,
    size, p
  ),
  // Wood (lumber): a conifer.
  Wood: ({ size = 20, ...p }) => base(
    <><path d="M12 3l5 7h-3l4 6h-3l3 5H6l3-5H6l4-6H7z" /><line x1="12" y1="21" x2="12" y2="17" /></>,
    size, p
  ),
  // Sheep (wool): a rounded silhouette with ears + legs.
  Sheep: ({ size = 20, ...p }) => base(
    <><circle cx="12" cy="12" r="5" /><circle cx="7" cy="10" r="1.5" /><circle cx="17" cy="10" r="1.5" /><line x1="9" y1="17" x2="9" y2="20" /><line x1="15" y1="17" x2="15" y2="20" /></>,
    size, p
  ),
  // Hay (grain): a wheat sheaf.
  Hay: ({ size = 20, ...p }) => base(
    <><path d="M12 3v18" /><path d="M12 7c-3-1-5 1-5 4" /><path d="M12 7c3-1 5 1 5 4" /><path d="M12 12c-3-1-5 1-5 4" /><path d="M12 12c3-1 5 1 5 4" /></>,
    size, p
  ),
  // Ore: a rough mountain peak.
  Ore: ({ size = 20, ...p }) => base(
    <><path d="M2 20l7-11 4 5 3-4 6 10z" /><path d="M9 9l4 5" /></>,
    size, p
  ),
};

// Convenient map from resource id → icon component (for data-driven rows).
export const ResourceIcons = {
  brick: Icons.Brick,
  lumber: Icons.Wood,
  wool: Icons.Sheep,
  grain: Icons.Hay,
  ore: Icons.Ore,
};

export default Icons;
