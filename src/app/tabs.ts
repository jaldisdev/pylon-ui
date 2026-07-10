import {LayoutDashboard, Terminal, SquarePen, Table2, Sparkles, type LucideIcon} from "lucide-react";

// Single source of truth for the app's 4 tabs, shared by the desktop sidebar,
// the mobile bottom nav, and the route table.
export interface TabSpec {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const tabs: TabSpec[] = [
  {path: "", label: "Dashboard", icon: LayoutDashboard},
  {path: "repl", label: "REPL", icon: Terminal},
  {path: "query", label: "Query Editor", icon: SquarePen},
  {path: "data", label: "Data Explorer", icon: Table2},
  {path: "ai", label: "AI", icon: Sparkles},
];
