import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, type Theme } from "@/lib/theme/store";

/** Snapshot de servidor: en SSR no hay localStorage y el tema por defecto es oscuro. */
const SERVER_SNAPSHOT: Theme = "dark";

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, () => SERVER_SNAPSHOT);
}
