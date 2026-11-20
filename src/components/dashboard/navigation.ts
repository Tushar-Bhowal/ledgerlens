import { ArrowDownLeft, ArrowUpRight, LayoutDashboard, ListChecks, MessageSquareText, ShieldAlert } from "lucide-react";

export const dashboardNavigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Assistant", href: "/assistant", icon: MessageSquareText },
  { label: "Receivables", href: "/receivables", icon: ArrowDownLeft },
  { label: "Payables", href: "/payables", icon: ArrowUpRight },
  { label: "Risk & exceptions", href: "/exceptions", icon: ShieldAlert },
  { label: "Action queue", href: "/actions", icon: ListChecks },
];
