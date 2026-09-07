import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { setTheme } from "@/lib/theme/store";

/** Conmutador de tema para la barra lateral y la barra superior móvil. */
export function ThemeToggle() {
  const theme = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(light ? "dark" : "light")}
      aria-label={light ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={light ? "Tema oscuro" : "Tema claro"}
      className="shrink-0 p-2 -m-1 rounded text-muted transition-colors hover:text-gold"
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
