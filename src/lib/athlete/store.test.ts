import { afterEach, describe, expect, test } from "bun:test";
import { getActiveAthlete, setActiveAthlete, subscribeAthlete } from "./store";

// El store lee localStorage dentro de cada función (no al importar), así que
// se puede reemplazar entre pruebas sin orden de importación.
function instalaStorage(inicial: Record<string, string> = {}): () => Record<string, string> {
  const data = new Map<string, string>(Object.entries(inicial));
  const storage: Storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => void data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
  globalThis.localStorage = storage;
  return () => Object.fromEntries(data);
}

function instalaStorageQueLanza(): void {
  const boom = (): never => {
    throw new Error("storage bloqueado");
  };
  const storage: Storage = {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    get length() {
      return 0;
    },
  };
  globalThis.localStorage = storage;
}

afterEach(() => instalaStorage());

describe("getActiveAthlete", () => {
  test("jose por defecto", () => {
    instalaStorage();
    expect(getActiveAthlete()).toBe("jose");
  });

  test("valor basura en el storage también cae en jose", () => {
    instalaStorage({ athlete_profile: "pepito" });
    expect(getActiveAthlete()).toBe("jose");
  });
});

describe("setActiveAthlete", () => {
  test("persiste y notifica a los suscriptores", () => {
    const dump = instalaStorage();
    let llamadas = 0;
    const off = subscribeAthlete(() => {
      llamadas += 1;
    });

    setActiveAthlete("andrea");

    expect(llamadas).toBe(1);
    expect(dump()["athlete_profile"]).toBe("andrea");
    expect(getActiveAthlete()).toBe("andrea");
    off();
  });

  test("con localStorage bloqueado no revienta y el toggle sigue notificando", () => {
    instalaStorageQueLanza();
    let llamadas = 0;
    const off = subscribeAthlete(() => {
      llamadas += 1;
    });

    expect(getActiveAthlete()).toBe("jose");
    setActiveAthlete("andrea"); // no debe lanzar
    expect(llamadas).toBe(1);
    // No persistió, pero el store sigue respondiendo sin romperse.
    expect(getActiveAthlete()).toBe("jose");
    off();
  });
});

describe("subscribeAthlete", () => {
  test("el unsubscribe que devuelve de verdad desuscribe", () => {
    instalaStorage();
    let llamadas = 0;
    const off = subscribeAthlete(() => {
      llamadas += 1;
    });

    off();
    setActiveAthlete("andrea");

    expect(llamadas).toBe(0);
  });
});
