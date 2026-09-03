import { describe, expect, test } from "bun:test";
import {
  bandFromEnergy,
  buildTimeline,
  fillTimeline,
  TOLERANCE_MS,
  type BandPools,
  type TimelineTrack,
} from "./playlist-timeline";
import { expandSteps, resolveStepSeconds, type Step } from "./workout-steps";
import { buildSessionPhases, deriveIntensity } from "./spotify-intensity";
import type { SessionPhase } from "./spotify-intensity";

const min = (m: number) => m * 60_000;
const track = (uri: string, minutes: number, popularity = 0.5): TimelineTrack => ({
  uri,
  popularity,
  durationMs: min(minutes),
});

const emptyPools: BandPools = { baja: [], moderada: [], alta: [] };

const step = (over: Partial<Step> & { stepTypeKey: string }): Step => ({
  stepType: { stepTypeKey: over.stepTypeKey },
  endCondition: over.endCondition,
  endConditionValue: over.endConditionValue,
  numberOfIterations: over.numberOfIterations,
  targetType: over.targetType,
  targetValueOne: over.targetValueOne,
  targetValueTwo: over.targetValueTwo,
  workoutSteps: over.workoutSteps,
});

// ── expandSteps / resolveStepSeconds ────────────────────────────────────────

describe("expandSteps", () => {
  test("expande grupos de repetición multiplicando los hijos", () => {
    const series = step({
      stepTypeKey: "repeat",
      numberOfIterations: 8,
      workoutSteps: [
        step({ stepTypeKey: "interval", endCondition: "time", endConditionValue: 120 }),
        step({ stepTypeKey: "recovery", endCondition: "time", endConditionValue: 60 }),
      ],
    });
    const out = expandSteps([series]);
    expect(out.length).toBe(16);
    const keyOf = (s: Step) => (s.stepType as { stepTypeKey?: string })?.stepTypeKey;
    expect(out.filter((s) => keyOf(s) === "interval").length).toBe(8);
  });

  test("los pasos normales pasan tal cual y los repeats vacíos no se expanden", () => {
    const plain = step({ stepTypeKey: "warmup", endCondition: "time", endConditionValue: 300 });
    const empty = step({ stepTypeKey: "repeat", numberOfIterations: 5 });
    expect(expandSteps([plain, empty]).length).toBe(2);
  });
});

describe("resolveStepSeconds", () => {
  test("condición de tiempo devuelve el valor en segundos", () => {
    expect(
      resolveStepSeconds(
        step({ stepTypeKey: "warmup", endCondition: "time", endConditionValue: 600 }),
        "running",
      ),
    ).toBe(600);
  });

  test("condición por distancia se resuelve con el ritmo del target", () => {
    // 1000 m a (2.5 + 3.5)/2 = 3 m/s → 333.33 s, no 1000 "segundos".
    const s = resolveStepSeconds(
      step({
        stepTypeKey: "interval",
        endCondition: "distance",
        endConditionValue: 1000,
        targetType: { workoutTargetTypeKey: "pace.zone" },
        targetValueOne: 3.5,
        targetValueTwo: 2.5,
      }),
      "running",
    );
    expect(Math.abs(s - 333.33)).toBeLessThan(1);
  });

  test("distancia sin target cae al ritmo medio del deporte", () => {
    // 2000 m corriendo a 6 min/km → 720 s (12 min), antes eran 2000 s (33 min).
    expect(
      resolveStepSeconds(
        step({ stepTypeKey: "interval", endCondition: "distance", endConditionValue: 2000 }),
        "running",
      ),
    ).toBe(720);
  });

  test("lap.button no aporta duración", () => {
    expect(
      resolveStepSeconds(
        step({ stepTypeKey: "cooldown", endCondition: "lap.button", endConditionValue: 1 }),
        "running",
      ),
    ).toBe(0);
  });
});

// ── Fases desde el workout real ─────────────────────────────────────────────

const repeatWorkoutSession = {
  name: "W7 Fri Intervals - Fast 8-4-2s",
  sport: "running",
  garmin_workout: {
    workoutSegments: [
      {
        workoutSteps: [
          step({ stepTypeKey: "warmup", endCondition: "time", endConditionValue: 600 }),
          step({
            stepTypeKey: "repeat",
            numberOfIterations: 8,
            workoutSteps: [
              step({
                stepTypeKey: "interval",
                endCondition: "time",
                endConditionValue: 120,
                description: "FC: 155–170 bpm (Z4)",
              }),
              step({
                stepTypeKey: "recovery",
                endCondition: "time",
                endConditionValue: 60,
              }),
            ],
          }),
          step({ stepTypeKey: "cooldown", endCondition: "time", endConditionValue: 300 }),
        ],
      },
    ],
  },
};

describe("buildSessionPhases desde pasos", () => {
  test("las series expandidas aportan sus minutos y quedan numeradas", () => {
    const phases = buildSessionPhases(repeatWorkoutSession, deriveIntensity(repeatWorkoutSession));
    expect(phases[0].label).toBe("Calentamiento");
    expect(phases[1].label).toBe("Intervalo 1");
    expect(phases[2].label).toBe("Recuperación 1");
    const total = phases.reduce((a, p) => a + (p.seconds ?? p.minutes * 60), 0);
    // 600 + 8×(120+60) + 300 = 2340 s = 39 min.
    expect(total).toBe(2340);
  });

  test("estimateMinutes ya no confunde metros con segundos", () => {
    const session = {
      name: "Tempo 2km Repeats",
      sport: "running",
      garmin_workout: {
        workoutSegments: [
          {
            workoutSteps: [
              step({
                stepTypeKey: "interval",
                endCondition: "distance",
                endConditionValue: 2000,
                targetType: { workoutTargetTypeKey: "pace.zone" },
                targetValueOne: 3.2,
                targetValueTwo: 2.9,
              }),
            ],
          },
        ],
      },
    };
    expect(deriveIntensity(session).estimatedMinutes).toBe(11); // 2000/3.05 ≈ 655 s
  });
});

// ── Línea de tiempo y llenado ───────────────────────────────────────────────

describe("bandFromEnergy / buildTimeline", () => {
  test("bandas alineadas con los niveles de intensidad", () => {
    expect(bandFromEnergy(0.25)).toBe("baja");
    expect(bandFromEnergy(0.6)).toBe("moderada");
    expect(bandFromEnergy(0.9)).toBe("alta");
  });

  test("acumula arranques absolutos y respeta los segundos exactos", () => {
    const windows = buildTimeline([
      { energy: 0.3, minutes: 8, seconds: 480, label: "Calentamiento" },
      { energy: 0.9, minutes: 12, seconds: 720, label: "Intervalos" },
    ]);
    expect(windows[0].startMs).toBe(0);
    expect(windows[0].endMs).toBe(min(8));
    expect(windows[1].startMs).toBe(min(8));
    expect(windows[1].endMs).toBe(min(20));
  });

  test("micro-fases de igual banda se consolidan", () => {
    const windows = buildTimeline([
      { energy: 0.3, minutes: 1, label: "Ajuste fino" },
      { energy: 0.35, minutes: 5, label: "Calentamiento" },
      { energy: 0.9, minutes: 10, label: "Intervalos" },
    ]);
    expect(windows.length).toBe(2);
    expect(windows[0].endMs).toBe(min(6));
    // La etiqueta de la fase más larga gana la fusión.
    expect(windows[0].label).toBe("Calentamiento");
  });
});

describe("fillTimeline", () => {
  const phases: SessionPhase[] = [
    { energy: 0.3, minutes: 8, seconds: 480, label: "Calentamiento" },
    { energy: 0.9, minutes: 12, seconds: 720, label: "Intervalos" },
    { energy: 0.25, minutes: 5, seconds: 300, label: "Enfriamiento" },
  ];

  test("el calentamiento de 8 min se llena con canciones suaves de ~8 min", () => {
    const pools: BandPools = {
      baja: [track("b1", 4), track("b2", 4), track("b3", 4), track("b4", 3)],
      moderada: [],
      alta: [track("a1", 3), track("a2", 3), track("a3", 3), track("a4", 3)],
    };
    const { segments } = fillTimeline(pools, [], phases);
    expect(segments[0].uris).toEqual(["b1", "b2"]);
    expect(Math.abs(segments[0].errorSec)).toBeLessThanOrEqual(TOLERANCE_MS / 1000);
  });

  test("la primera canción fuerte arranca en la frontera de los intervalos", () => {
    const pools: BandPools = {
      baja: [track("b1", 4), track("b2", 4), track("b3", 5)],
      moderada: [],
      alta: [track("a1", 3), track("a2", 3), track("a3", 3), track("a4", 3)],
    };
    const { segments } = fillTimeline(pools, [], phases);
    // 8:00 ± 45s es el arranque real del bloque fuerte.
    expect(Math.abs(segments[1].startSec - 480)).toBeLessThanOrEqual(TOLERANCE_MS / 1000);
    expect(segments[1].uris[0]).toBe("a1");
    // El enfriamiento vuelve a música suave.
    expect(segments[2].uris[0]).toMatch(/^b/);
  });

  test("el error de una fase no se acumula en la siguiente (anclaje absoluto)", () => {
    // Calentamiento de 8 min con solo canciones de 5 y 4 min: 5+4 = 9 min,
    // +60 s de error. Los intervalos deben cerrar contra SU minuto absoluto
    // (20:00), no contra 9:00 + 12:00.
    const pools: BandPools = {
      baja: [track("b1", 5), track("b2", 4)],
      moderada: [],
      alta: Array.from({ length: 6 }, (_, i) => track(`a${i}`, 3)),
    };
    const { segments } = fillTimeline(pools, [], phases);
    expect(segments[0].errorSec).toBe(60);
    const endOfIntervals = segments[1].startSec + segments[1].filledSec;
    expect(Math.abs(endOfIntervals - 1200)).toBeLessThanOrEqual(TOLERANCE_MS / 1000 + 30);
  });

  test("fase con la banda agotada pide prestado a la adyacente", () => {
    const pools: BandPools = {
      baja: [track("b1", 4), track("b2", 4)],
      moderada: [track("m1", 3), track("m2", 3)],
      alta: [],
    };
    const { segments } = fillTimeline(pools, [], phases);
    // El bloque fuerte se llena con moderada, no queda vacío.
    expect(segments[1].uris.length).toBeGreaterThan(0);
    expect(segments[1].uris[0]).toBe("m1");
  });

  test("los acentos personales cuentan su duración en el llenado", () => {
    const pools: BandPools = {
      baja: [track("b1", 3)],
      moderada: [],
      alta: [track("a1", 3), track("a2", 3), track("a3", 3)],
    };
    const personal = [track("p1", 10)];
    const { segments } = fillTimeline(pools, personal, phases);
    expect(segments[0].uris).toContain("p1");
    // 3 (b1) + 10 (p1) = 13 min de música en la fase de 8 min.
    expect(segments[0].filledSec).toBe(min(13) / 1000);
  });

  test("pistas sin duración útil se asumen de 3.5 min y no cuelgan el llenado", () => {
    const pools: BandPools = {
      baja: [
        { uri: "b0", popularity: 0.5, durationMs: 0 },
        { uri: "b0b", popularity: 0.5, durationMs: -5 },
      ],
      moderada: [],
      alta: [],
    };
    const { uris, segments } = fillTimeline(
      pools,
      [],
      [{ energy: 0.3, minutes: 8, label: "Calentamiento" }],
    );
    // Cada una cuenta como 3.5 min: dos llenan 7 de los 8 minutos.
    expect(uris).toEqual(["b0", "b0b"]);
    expect(segments[0].filledSec).toBe((2 * 210_000) / 1000);
  });
});
