import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Rutas que en desarrollo atiende el proxy de Vite (ver vite.config.ts) y que en
// producción tiene que atender alguien: el frontend las pide con rutas relativas.
// El Worker hace ese papel.
const API_PATHS = new Set([
  "/plan",
  "/garmin",
  "/insights",
  "/update",
  "/diagnose",
  "/diagnosis",
  "/gym",
]);

type ApiEnv = { API_BASE?: string; API_TOKEN?: string };

/**
 * Reenvía la petición al backend en Railway añadiendo el token.
 *
 * El token vive como secreto del Worker y nunca baja al navegador. La
 * alternativa —meterlo en el bundle con VITE_— lo dejaría legible para
 * cualquiera que abriera la página, y con él se pueden leer datos de salud y
 * disparar /update, que gasta tokens de Anthropic.
 */
async function proxyToApi(request: Request, env: ApiEnv): Promise<Response> {
  const base = env.API_BASE;
  if (!base) {
    return new Response(JSON.stringify({ detail: "API_BASE no configurado en el Worker." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, base);

  const headers = new Headers();
  headers.set("accept", "application/json");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (env.API_TOKEN) headers.set("x-api-token", env.API_TOKEN);

  // El cuerpo se lee entero en vez de reenviar el stream: los payloads son de
  // unos pocos KB y el streaming con `body` exige `duplex`, que no todos los
  // runtimes aceptan igual.
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.text();

  try {
    const upstream = await fetch(target.toString(), { method: request.method, headers, body });
    const out = new Headers(upstream.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ detail: "El backend no respondió." }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const path = new URL(request.url).pathname;
      if (API_PATHS.has(path)) {
        return await proxyToApi(request, (env ?? {}) as ApiEnv);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
