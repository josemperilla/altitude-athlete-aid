// Las prescripciones de este archivo NO son inventadas: salen literales de
// backend/tools/strength_plan.py, que es la fuente de verdad del plan de
// gimnasio. Si el backend cambia de formato, este archivo es el que avisa.

import { describe, expect, test } from "bun:test";
import { isTimed, parsePrescription, timedSegments } from "./prescription";

/** Las 38 prescripciones del catálogo, por sesión. */
const CATALOGO = [
  // Sesión A
  "5 min",
  "1 × 10 / lado",
  "2 × 20",
  "3 × 4",
  "4 × 5",
  "3 × 6",
  "3 × 6 / pierna",
  "3 × 8",
  "3 × 12 / pierna",
  "3 × 10 / lado",
  // Sesión B
  "4 min",
  "2 × 15 pasos",
  "3 × 8 / lado",
  "3 × 8 / pierna",
  "3 × 10",
  "3 × 20–30 s / lado",
  "3 × 12 / lado",
  "3 × 8",
  "3 × 10",
  "2 × 15",
  "2 × 15 / pie",
  "3 × 10 / lado",
  // Sesión M
  "2 × 15",
  "2 × 3",
  "2 × 8",
  "2 × 10 / lado",
  // Sesión C1
  "1 × 10 / pie",
  "2 × 15",
  "3 × 10 / pierna",
  "3 × 8 / pierna",
  "3 × 15 / pierna",
  "2 × 8 / lado",
  // Sesión C2
  "2 × 10 / pie",
  "2 × 15",
  "3 × 20",
  "2 × 12 / pierna",
  "2 × 8 / lado",
  "2 × 10 / lado",
];

/** El resultado de la auditoría: exactamente estas tres llevan cronómetro. */
const TIMED = new Set(["5 min", "4 min", "3 × 20–30 s / lado"]);

describe("el catálogo real", () => {
  test("solo tres de las 38 prescripciones son de tiempo", () => {
    const timed = CATALOGO.filter(isTimed);
    expect(new Set(timed)).toEqual(TIMED);
  });

  test("ninguna prescripción del catálogo queda sin clasificar", () => {
    for (const p of CATALOGO) {
      expect(parsePrescription(p).kind).not.toBe("unknown");
    }
  });

  test("todo lo que no es de tiempo son repeticiones", () => {
    for (const p of CATALOGO) {
      if (TIMED.has(p)) continue;
      expect(parsePrescription(p).kind).toBe("reps");
    }
  });
});

describe("series por tiempo", () => {
  test("«3 × 20–30 s / lado»: techo 30 s, suelo 20 s, por lado", () => {
    expect(parsePrescription("3 × 20–30 s / lado")).toEqual({
      kind: "sets",
      sets: 3,
      seconds: 30,
      minSeconds: 20,
      perSide: true,
    });
  });

  test("se expande a seis cronómetros, uno por serie y lado", () => {
    const segs = timedSegments(parsePrescription("3 × 20–30 s / lado"));
    expect(segs).toHaveLength(6);
    expect(segs.map((s) => s.label)).toEqual([
      "S1 izq",
      "S1 der",
      "S2 izq",
      "S2 der",
      "S3 izq",
      "S3 der",
    ]);
    expect(segs.every((s) => s.seconds === 30 && s.minSeconds === 20)).toBe(true);
    expect(new Set(segs.map((s) => s.key)).size).toBe(6);
  });

  test("sin «/ lado» hay un cronómetro por serie", () => {
    const segs = timedSegments(parsePrescription("3 × 45 s"));
    expect(segs.map((s) => s.label)).toEqual(["S1", "S2", "S3"]);
  });

  test("un rango invertido toma el mayor como techo", () => {
    expect(parsePrescription("3 × 30–20 s")).toEqual({
      kind: "sets",
      sets: 3,
      seconds: 30,
      minSeconds: 20,
      perSide: false,
    });
  });

  test("un rango de extremos iguales no declara suelo", () => {
    const p = parsePrescription("2 × 30–30 s");
    expect(p).toEqual({ kind: "sets", sets: 2, seconds: 30, perSide: false });
  });

  test("minutos en series se convierten a segundos", () => {
    expect(parsePrescription("2 × 2 min")).toEqual({
      kind: "sets",
      sets: 2,
      seconds: 120,
      perSide: false,
    });
  });
});

describe("bloques continuos", () => {
  test("«5 min» son 300 segundos en un solo cronómetro", () => {
    expect(parsePrescription("5 min")).toEqual({ kind: "duration", seconds: 300 });
    expect(timedSegments(parsePrescription("5 min"))).toEqual([
      { key: "d0", label: "5 min", seconds: 300 },
    ]);
  });

  test("«4 min» son 240 segundos", () => {
    expect(parsePrescription("4 min")).toEqual({ kind: "duration", seconds: 240 });
  });

  test("una duración en segundos se etiqueta en segundos", () => {
    expect(timedSegments(parsePrescription("90 s"))[0].label).toBe("90 s");
  });
});

describe("variantes de formato que el backend podría escribir", () => {
  const equivalentes: [string, number][] = [
    ["3 x 30 s", 30],
    ["3 X 30 s", 30],
    ["3×30s", 30],
    ["3 × 30 seg", 30],
    ["3 × 30 segundos", 30],
    ["3 × 1 min", 60],
    ["3 × 1 minuto", 60],
    ["3 × 1 m", 60],
  ];
  for (const [texto, seconds] of equivalentes) {
    test(`«${texto}» → ${seconds} s`, () => {
      const p = parsePrescription(texto);
      expect(p.kind).toBe("sets");
      expect(p.kind === "sets" && p.seconds).toBe(seconds);
    });
  }

  test("«20 a 30 s» también es un rango", () => {
    expect(parsePrescription("3 × 20 a 30 s")).toEqual({
      kind: "sets",
      sets: 3,
      seconds: 30,
      minSeconds: 20,
      perSide: false,
    });
  });

  test("los espacios no separables no rompen el análisis", () => {
    expect(parsePrescription("3 × 20–30 s / lado").kind).toBe("sets");
  });

  test("«/ pierna», «/ pie» y «/ brazo» cuentan como por lado", () => {
    for (const suf of ["/ pierna", "/ pie", "/ brazo"]) {
      const p = parsePrescription(`2 × 30 s ${suf}`);
      expect(p.kind === "sets" && p.perSide).toBe(true);
    }
  });
});

describe("nunca lanza y nunca cronometra de más", () => {
  const basura = ["", "   ", "—", "AMRAP", "hasta el fallo", "3 ×", "0 × 30 s", "x", "3 × 0 s"];
  for (const texto of basura) {
    test(`«${texto}» no produce cronómetro`, () => {
      expect(() => parsePrescription(texto)).not.toThrow();
      expect(isTimed(texto)).toBe(false);
    });
  }

  test("una entrada que no es cadena se ignora sin romper", () => {
    // El backend tipa esto como string, pero schemas.ts es la única garantía
    // y un JSON corrupto no puede tumbar la pantalla del gimnasio.
    expect(parsePrescription(undefined as unknown as string).kind).toBe("unknown");
    expect(parsePrescription(null as unknown as string).kind).toBe("unknown");
  });

  test("las repeticiones no producen segmentos", () => {
    expect(timedSegments(parsePrescription("3 × 8"))).toEqual([]);
    expect(timedSegments(parsePrescription("2 × 15 pasos"))).toEqual([]);
  });

  test("«2 × 15 pasos» no confunde «pasos» con una unidad de tiempo", () => {
    expect(parsePrescription("2 × 15 pasos").kind).toBe("reps");
  });

  test("«1 × 10 / lado» son repeticiones, no 10 de algo cronometrable", () => {
    expect(parsePrescription("1 × 10 / lado").kind).toBe("reps");
  });
});
