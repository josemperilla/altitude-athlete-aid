// Lee la prescripción de un ejercicio y decide si se puede cronometrar.
//
// El backend manda `prescription` como texto libre en español ("3 × 8",
// "3 × 20–30 s / lado", "5 min") y nadie lo interpretaba: se pintaba tal cual.
// Aquí se traduce a algo que un cronómetro pueda ejecutar.
//
// Es derivación de dominio, no tolerancia a alias del backend, así que vive
// aquí y no en schemas.ts — mismo sitio que weeks.ts y weights.ts.
//
// Regla de oro: esto NUNCA lanza. Ante cualquier cosa que no entienda devuelve
// "unknown" y el ejercicio se queda exactamente como está hoy. Una prescripción
// rara no puede romper la pantalla del gimnasio en mitad de una sesión.

export type Parsed =
  /** "3 × 8", "2 × 15 pasos" — repeticiones, no hay nada que cronometrar. */
  | { kind: "reps" }
  /** "3 × 20–30 s / lado" — series sostenidas por tiempo. */
  | { kind: "sets"; sets: number; seconds: number; minSeconds?: number; perSide: boolean }
  /** "5 min" — un solo bloque continuo, sin series. */
  | { kind: "duration"; seconds: number }
  | { kind: "unknown" };

export type Segment = {
  /** Estable dentro del ejercicio: sirve de key de React y de identidad del chip. */
  key: string;
  /** Lo que se lee en el chip: "S1 izq", "S2 der", "5 min". */
  label: string;
  seconds: number;
  /** Suelo del rango, cuando la prescripción da uno ("20–30 s" → 20). */
  minSeconds?: number;
};

/** Todo lo que el backend usa (o podría usar) para multiplicar series. */
const MUL = "[x×X*]";
/** Guion normal, guion medio (U+2013), guion largo (U+2014) o "a". */
const DASH = "(?:\\s*(?:[-–—]|a)\\s*)";

const SEG_UNIT = /^(?:s|seg|segs|segundos?|'')$/;
const MIN_UNIT = /^(?:m|min|mins|minutos?|')$/;

/** Un lado a la vez: la serie se cronometra dos veces, izquierda y derecha. */
const PER_SIDE = /\/\s*(lado|pierna|pie|brazo|mano)/i;

/**
 * Normaliza para que las regex no tengan que lidiar con espacios raros.
 * El backend escribe con espacios finos y no separables en algunos sitios.
 */
function normalize(raw: string): string {
  return raw
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSeconds(value: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (SEG_UNIT.test(u)) return value;
  if (MIN_UNIT.test(u)) return value * 60;
  return null;
}

/**
 * Extrae una cantidad de tiempo de un trozo de texto: "20–30 s" → {30, min 20},
 * "5 min" → {300}. Devuelve null si ahí no hay una duración.
 *
 * En los rangos el objetivo es el TECHO y el suelo se guarda aparte: la cuenta
 * atrás sale del máximo (30 s) y avisa al cruzar el mínimo (20 s), así ves de
 * un vistazo que ya cumpliste lo mandado y cuánto te queda de lo deseable.
 */
function readDuration(text: string): { seconds: number; minSeconds?: number } | null {
  const m = text.match(
    new RegExp(`(\\d+(?:[.,]\\d+)?)(?:${DASH}(\\d+(?:[.,]\\d+)?))?\\s*([a-zá-ú'']+)`, "i"),
  );
  if (!m) return null;

  const lo = Number(m[1].replace(",", "."));
  const hi = m[2] === undefined ? null : Number(m[2].replace(",", "."));
  if (!Number.isFinite(lo)) return null;

  const target = toSeconds(hi ?? lo, m[3]);
  if (target === null || target <= 0) return null;

  // Un rango invertido ("30–20 s") es un error de datos, no una intención:
  // se toma el mayor como techo en vez de generar un mínimo imposible.
  if (hi === null) return { seconds: Math.round(target) };
  const floor = toSeconds(Math.min(lo, hi), m[3]);
  const ceil = toSeconds(Math.max(lo, hi), m[3]);
  if (floor === null || ceil === null) return { seconds: Math.round(target) };
  return floor === ceil
    ? { seconds: Math.round(ceil) }
    : { seconds: Math.round(ceil), minSeconds: Math.round(floor) };
}

export function parsePrescription(prescription: string): Parsed {
  if (typeof prescription !== "string") return { kind: "unknown" };
  const text = normalize(prescription);
  if (!text) return { kind: "unknown" };

  const perSide = PER_SIDE.test(text);

  // Con multiplicador: "N × <lo que sea>". Si la derecha es tiempo, son series
  // cronometrables; si son repeticiones, aquí no hay nada que hacer.
  const sets = text.match(new RegExp(`^(\\d+)\\s*${MUL}\\s*(.+)$`));
  if (sets) {
    const count = Number(sets[1]);
    if (!Number.isFinite(count) || count < 1) return { kind: "unknown" };

    const dur = readDuration(sets[2]);
    if (!dur) return { kind: "reps" };
    return {
      kind: "sets",
      sets: Math.round(count),
      seconds: dur.seconds,
      ...(dur.minSeconds === undefined ? {} : { minSeconds: dur.minSeconds }),
      perSide,
    };
  }

  // Sin multiplicador: un bloque continuo, si trae unidad de tiempo.
  // "1 × 10 / lado" ya cayó arriba, así que aquí no hay riesgo de confundir
  // repeticiones sueltas con minutos.
  const dur = readDuration(text);
  if (dur) return { kind: "duration", seconds: dur.seconds };

  return { kind: "unknown" };
}

/** Nombre corto del lado, para no repetir "izquierda"/"derecha" en un chip de 60px. */
const SIDES = ["izq", "der"] as const;

/**
 * Expande la prescripción a las cuentas atrás concretas que hay que correr.
 *
 * "3 × 20–30 s / lado" → 6 segmentos, porque cada serie se hace de los dos lados
 * y cada lado es su propio cronómetro. Contar una sola vez por serie sería mentir
 * sobre el trabajo hecho.
 */
export function timedSegments(parsed: Parsed): Segment[] {
  if (parsed.kind === "duration") {
    return [{ key: "d0", label: mmssLabel(parsed.seconds), seconds: parsed.seconds }];
  }
  if (parsed.kind !== "sets") return [];

  const out: Segment[] = [];
  const extra = parsed.minSeconds === undefined ? {} : { minSeconds: parsed.minSeconds };
  for (let s = 0; s < parsed.sets; s++) {
    if (parsed.perSide) {
      for (const side of SIDES) {
        out.push({
          key: `s${s}-${side}`,
          label: `S${s + 1} ${side}`,
          seconds: parsed.seconds,
          ...extra,
        });
      }
    } else {
      out.push({ key: `s${s}`, label: `S${s + 1}`, seconds: parsed.seconds, ...extra });
    }
  }
  return out;
}

/** Etiqueta humana para un bloque continuo: "5 min", "90 s". */
function mmssLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Atajo para los componentes: ¿este ejercicio lleva cronómetro? */
export function isTimed(prescription: string): boolean {
  const kind = parsePrescription(prescription).kind;
  return kind === "sets" || kind === "duration";
}
