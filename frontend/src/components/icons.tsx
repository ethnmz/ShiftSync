// Small line icons (24px grid, 1.75 stroke). Drawn for ShiftSync.
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const HomeIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
  </svg>
);
export const PlusCircleIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);
export const InboxIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z" />
    <path d="M4 13.5h4.5l1 2h5l1-2H20" />
  </svg>
);
export const ClockIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const ChartIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M5 20V11M10 20V5M15 20v-7M20 20V8" />
  </svg>
);
export const PeopleIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
    <circle cx="17" cy="9.5" r="2.3" />
    <path d="M16 14.6c2.3.1 3.9 1.5 4.5 4.4" />
  </svg>
);
export const ListIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M9 7h11M9 12h11M9 17h11" />
    <circle cx="4.5" cy="7" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="12" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="17" r=".6" fill="currentColor" />
  </svg>
);
export const CheckCircleIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </svg>
);
export const FlagIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M6 20V4.5M6 5h10.5l-2 3.5 2 3.5H6" />
  </svg>
);
export const HelpIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.8 9.6a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1.9-1.1 1.7M12 16.5v.1" />
  </svg>
);

// ShiftSync mark: two opposing arrows (one shift hands over, the other takes
// over) on an ink tile. Used in place of the wordmark.
export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="ShiftSync">
    <rect width="32" height="32" rx="9" className="fill-ink" />
    <g fill="none" stroke="white" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12.5h13M18.5 9l3.5 3.5-3.5 3.5" />
      <path d="M23 19.5H10M13.5 16 10 19.5l3.5 3.5" />
    </g>
  </svg>
);
