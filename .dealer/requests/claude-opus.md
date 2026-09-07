## REQUEST 1

NEED: `src/server.ts` — añadir `"/gym/done"` al `Set` `API_PATHS` (línea 72).
También `vite.config.ts` — añadir una entrada `"/gym/done"` al bloque `proxy`
(línea 21), con el mismo `htmlBypass` que las demás.

WHY: `API_PATHS` es un `Set` de coincidencia EXACTA (`API_PATHS.has(path)`), no
un prefijo. En producción `/gym/done` no entra al proxy: cae al handler de SSR y
la app recibe HTML donde espera JSON. El toggle "Hecha" y los pesos funcionan en
`npm run dev` (el proxy de Vite sí es por prefijo, y `/gym` cubre `/gym/done`)
pero se rompen en Railway. Ningún carril posee estos dos archivos y no están en
`seams`: es un hueco del contrato, no una desviación de nadie.

WORKAROUND: ninguno posible desde mis archivos — la ruta se resuelve antes de
llegar al cliente. Mi carril queda funcional en dev y roto en prod hasta que se
aplique este cambio.

BLOCKING: no (el código de mi carril está completo y no depende de esto para
compilar), pero la feature no sirve desplegada sin él.
