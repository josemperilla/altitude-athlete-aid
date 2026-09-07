import { describe, expect, test } from "bun:test";
import { diaCorto, parseSemana, semanaVigente, todayISO } from "./weeks";

// El bloque real de 2026, reducido a los campos que parseSemana lee.
const bloque: unknown[] = [
  {
    start: "2026-09-07",
    end: "2026-09-13",
    sessions: [
      { date: "2026-09-07", session: "A" },
      { date: "2026-09-09", session: "B" },
    ],
  },
  {
    start: "2026-09-28",
    end: "2026-10-04",
    sessions: [{ date: "2026-09-28", session: "M" }],
  },
  // La semana puente: existe y viene VACÍA a propósito (José recuperándose
  // del medio del 4-oct, Andrea en taper de Chicago del 11-oct).
  { start: "2026-10-05", end: "2026-10-11", sessions: [] },
];

// ── semanaVigente ───────────────────────────────────────────────────────────

describe("semanaVigente", () => {
  test("hoy dentro de una semana → esa semana", () => {
    const semana = semanaVigente(bloque, "2026-09-08");
    expect(semana?.start).toBe("2026-09-07");
    expect(semana?.sessions.length).toBe(2);
  });

  test("hoy en la semana puente la devuelve VACÍA, no null", () => {
    // El caso que gobierna octubre: una semana con cero sesiones existe a
    // propósito. Confundirla con "no encontrada" es el error que esta
    // prueba existe para atrapar.
    const semana = semanaVigente(bloque, "2026-10-06");
    expect(semana).not.toBeNull();
    expect(semana?.start).toBe("2026-10-05");
    expect(semana?.sessions.length).toBe(0);
  });

  test("hoy anterior a todo el bloque → la primera semana futura", () => {
    const semana = semanaVigente(bloque, "2026-08-30");
    expect(semana?.start).toBe("2026-09-07");
  });

  test("hoy posterior a todas → null", () => {
    expect(semanaVigente(bloque, "2026-10-12")).toBeNull();
  });
});

// ── parseSemana ─────────────────────────────────────────────────────────────

describe("parseSemana", () => {
  test("descarta lo que no calza sin lanzar", () => {
    expect(parseSemana(null)).toBeNull();
    expect(parseSemana(42)).toBeNull();
    expect(parseSemana({ end: "2026-09-13" })).toBeNull(); // sin start
  });

  test("conserva la semana y tira solo las sesiones inválidas", () => {
    const semana = parseSemana({
      start: "2026-09-07",
      end: "2026-09-13",
      sessions: [null, { session: "sin fecha" }, { date: "2026-09-07", session: "A" }, 7],
    });
    expect(semana).not.toBeNull();
    expect(semana?.sessions).toEqual([{ date: "2026-09-07", session: "A" }]);
  });
});

// ── Fechas ──────────────────────────────────────────────────────────────────

describe("todayISO", () => {
  test("fecha local con ceros: 5-ene-2026 → 2026-01-05", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("diaCorto", () => {
  test("2026-09-07 → Lun 7, sin caer en el desfase UTC", () => {
    // Parsear con new Date("2026-09-07") daría medianoche UTC: en Bogotá
    // (UTC-5) eso ya es domingo 6. La función parsea a mano justamente para
    // que el día no dependa de la zona horaria — y esta prueba tampoco.
    expect(diaCorto("2026-09-07")).toBe("Lun 7");
  });
});
