import { afterEach, describe, expect, test } from "bun:test";
import { getTheme, setTheme, subscribeTheme } from "./store";

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

describe("getTheme", () => {
  test("dark por defecto", () => {
    instalaStorage();
    expect(getTheme()).toBe("dark");
  });

  test("valor basura en el storage también cae en dark", () => {
    instalaStorage({ theme: "neon" });
    expect(getTheme()).toBe("dark");
  });
});

describe("setTheme", () => {
  test("persiste, marca el <html> y notifica a los suscriptores", () => {
    const dump = instalaStorage();
    let llamadas = 0;
    const off = subscribeTheme(() => {
      llamadas += 1;
    });

    setTheme("light");

    expect(llamadas).toBe(1);
    expect(dump()["theme"]).toBe("light");
    expect(getTheme()).toBe("light");
    // En bun test no hay DOM: la marca en <html> solo se verifica con el
    // navegador (script pre-hidratación + setTheme la mantienen).
    off();
  });

  test("con localStorage bloqueado no revienta y el toggle sigue notificando", () => {
    instalaStorageQueLanza();
    let llamadas = 0;
    const off = subscribeTheme(() => {
      llamadas += 1;
    });

    expect(getTheme()).toBe("dark");
    setTheme("light"); // no debe lanzar
    expect(llamadas).toBe(1);
    expect(getTheme()).toBe("dark"); // no persistió, pero sigue respondiendo
    off();
  });
});

describe("subscribeTheme", () => {
  test("el unsubscribe que devuelve de verdad desuscribe", () => {
    instalaStorage();
    let llamadas = 0;
    const off = subscribeTheme(() => {
      llamadas += 1;
    });

    off();
    setTheme("light");

    expect(llamadas).toBe(0);
  });
});
