import { ChartNoAxesColumn, CircleCheck, CircleHelp, CirclePlus, Clapperboard, Clock, Flag, House, Inbox, List, Users } from "lucide-react";

// Line icons from lucide-react (the Harbor reference uses the same set).
// The old names are kept so screens don't change. Decorative: the label
// always sits next to the icon.
const props = { size: 20, strokeWidth: 1.8, "aria-hidden": true } as const;

export const HomeIcon = () => <House {...props} />;
export const PlusCircleIcon = () => <CirclePlus {...props} />;
export const InboxIcon = () => <Inbox {...props} />;
export const ClockIcon = () => <Clock {...props} />;
export const ChartIcon = () => <ChartNoAxesColumn {...props} />;
export const PeopleIcon = () => <Users {...props} />;
export const ListIcon = () => <List {...props} />;
export const CheckCircleIcon = () => <CircleCheck {...props} />;
export const FlagIcon = () => <Flag {...props} />;
export const HelpIcon = () => <CircleHelp {...props} />;
export const DemoIcon = () => <Clapperboard {...props} />;

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
