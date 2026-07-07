import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorClosed,
  FileText,
  type LucideIcon,
  Settings,
  Users,
} from "lucide-react";

export type NavIconName =
  | "CalendarDays"
  | "CalendarClock"
  | "Users"
  | "ClipboardList"
  | "DoorClosed"
  | "FileText"
  | "Settings";

export type NavItem = { href: string; label: string; icon: NavIconName };

/** 名前 → Lucide コンポーネント(server→client 境界で関数を渡さないため名前で解決) */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  CalendarDays,
  CalendarClock,
  Users,
  ClipboardList,
  DoorClosed,
  FileText,
  Settings,
};
