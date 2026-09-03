/*
 * Servidor estático mínimo para Railway.
 *
 * Sin dependencias a propósito: la app es HTML, CSS y tres módulos JS, y meter
 * express aquí sólo añadiría un lockfile y superficie de actualización para algo
 * que el módulo http resuelve en 50 líneas. Railway necesita un proceso que
 * escuche en $PORT; esto es exactamente eso.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';

  // normalize() colapsa los "..", y el prefijo se verifica después: sin esto un
  // /../../etc/passwd saldría del directorio public.
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // no-cache en todo: la app pesa unos pocos KB y se republica cada semana con
    // el plan nuevo. Un max-age aquí sólo consigue que el atleta abra el
    // gimnasio con la rutina de la semana pasada, que es el único fallo que
    // importa. El navegador igual revalida con ETag, así que no cuesta nada.
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    // SPA de una sola vista: cualquier ruta desconocida devuelve el index.
    try {
      const body = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': TYPES['.html'] }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
});

server.listen(PORT, () => console.log(`Gimnasio escuchando en :${PORT}`));
