/*
 * Servidor de producción para Railway.
 *
 * Sustituye al adaptador de Cloudflare. El build de Vite deja dos cosas:
 *
 *   dist/client/   estáticos con hash en el nombre (JS, CSS, imágenes)
 *   dist/server/   bundle SSR cuyo `export default` es un handler { fetch }
 *                  estándar de la Web, el mismo que consumía el Worker
 *
 * Cloudflare solo ponía el pegamento: servir dist/client y llamar a ese fetch
 * para todo lo demás. Eso es lo que hace este archivo, sobre Node.
 *
 * Sin dependencias a propósito, igual que el servidor de la app de gimnasio que
 * ya vivía en este proyecto: Node 20 ya trae Request, Response y ReadableStream,
 * así que meter express o hono aquí solo añadiría lockfile y superficie de
 * actualización para 100 líneas.
 *
 * El env: en Cloudflare, API_BASE y API_TOKEN llegaban como `env` al fetch. Aquí
 * se le pasa process.env, así que src/server.ts no cambia una línea y el token
 * sigue sin bajar nunca al navegador.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLIENT = join(ROOT, "dist", "client");
// server.js y no index.js: el nombre lo fija `tanstackStart.server.entry` en
// vite.config.ts, que apunta a src/server.ts.
const SERVER_ENTRY = join(ROOT, "dist", "server", "server.js");
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// El bundle SSR se carga una sola vez y se reutiliza: importarlo por petición
// volvería a evaluar todo el árbol de React en cada request.
let ssrPromise;
function getSsr() {
  if (!ssrPromise) {
    ssrPromise = import(SERVER_ENTRY).then((m) => m.default ?? m);
  }
  return ssrPromise;
}

/** ¿Existe y es un archivo? Se resuelve dentro de dist/client, nunca fuera. */
async function resolveStatic(pathname) {
  // normalize colapsa los ".." antes de unir, así que una petición a
  // /../../etc/passwd no puede escaparse del directorio de estáticos.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(CLIENT, rel);
  if (!file.startsWith(CLIENT)) return null;
  try {
    const s = await stat(file);
    return s.isFile() ? file : null;
  } catch {
    return null;
  }
}

function sendFile(res, file) {
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  // Los assets de /assets/ llevan hash en el nombre, así que son inmutables y se
  // pueden cachear para siempre. El resto se revalida, que es lo correcto para
  // index.html y los archivos sueltos de public/.
  const immutable = file.includes(`${join("dist", "client", "assets")}`);
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  });
  createReadStream(file).pipe(res);
}

/** Petición de Node → Request de la Web. */
function toWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? `localhost:${PORT}`;
  const url = new URL(req.url, `${proto}://${host}`);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((one) => headers.append(k, one));
    else if (v !== undefined) headers.set(k, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    // Node exige duplex al mandar un stream como cuerpo.
    duplex: hasBody ? "half" : undefined,
  });
}

/** Response de la Web → respuesta de Node. */
async function sendWebResponse(res, webRes) {
  const headers = {};
  for (const [k, v] of webRes.headers) headers[k] = v;
  res.writeHead(webRes.status, headers);
  if (!webRes.body) {
    res.end();
    return;
  }
  Readable.fromWeb(webRes.body).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;

    // Estáticos primero: el SSR no tiene por qué ver una petición de un .js con
    // hash. index.html no se sirve por aquí — lo renderiza el SSR.
    if (pathname !== "/" && !pathname.endsWith("/")) {
      const file = await resolveStatic(pathname);
      if (file) {
        sendFile(res, file);
        return;
      }
    }

    const ssr = await getSsr();
    const webRes = await ssr.fetch(toWebRequest(req), process.env, {});
    await sendWebResponse(res, webRes);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Error interno del servidor.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Entrenador escuchando en ${HOST}:${PORT}`);
});
