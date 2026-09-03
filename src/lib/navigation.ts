import { Activity, BookOpen, CalendarDays, Dumbbell, Sun, type LucideIcon } from "lucide-react";

/**
 * Las pestañas de la app. "Hoy" es la cabina diaria; el resto cuelga de ella.
 * Los iconos son componentes lucide (referencias, no JSX) para que este
 * archivo siga siendo .ts.
 */
export const NAV_TABS = [
  { to: "/", label: "Hoy", short: "Hoy", icon: Sun },
  { to: "/plan", label: "Plan", short: "Plan", icon: CalendarDays },
  { to: "/cuerpo", label: "Cuerpo", short: "Cuerpo", icon: Activity },
  { to: "/gimnasio", label: "Gimnasio", short: "Gym", icon: Dumbbell },
  { to: "/aprende", label: "Aprende", short: "Aprende", icon: BookOpen },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}>;

export type NavTab = (typeof NAV_TABS)[number];
