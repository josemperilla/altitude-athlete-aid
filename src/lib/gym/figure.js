/*
 * Motor de animación de ejercicios.
 *
 * Las poses se guardan como ÁNGULOS de articulación, no como coordenadas, y las
 * posiciones se calculan por cinemática directa desde el pie hacia arriba. Con
 * coordenadas sueltas cada pose son ~20 números que hay que mantener coherentes
 * a mano, y basta un error para que a la figura le cambie el largo del fémur a
 * mitad del movimiento. Con ángulos los segmentos miden siempre lo mismo por
 * construcción y una pose son cinco números legibles.
 *
 * Convenciones
 *   - Vista lateral, la figura mira hacia +x (a la derecha).
 *   - Ángulos de segmento en grados, 0 = hacia arriba, positivo = horario
 *     (hacia adelante). Son ABSOLUTOS respecto a la vertical, no relativos al
 *     segmento padre: cuesta menos escribirlos y leerlos.
 *   - El pie es la excepción: 0 = horizontal hacia adelante, positivo = punta
 *     por debajo del tobillo.
 *   - Las poses tumbadas o sentadas se escriben como coordenadas crudas
 *     (mode: 'raw'); ahí la cinemática directa no aporta nada.
 */

const SEG = {
  shin: 22,
  thigh: 22,
  trunk: 26,
  neck: 11, // hombro → centro de la cabeza
  head: 6.5, // radio
  uarm: 12,
  farm: 12,
  toe: 11, // tobillo → punta
  heel: 6, // tobillo → talón
};

const rad = (d) => (d * Math.PI) / 180;

// Avanza `len` desde `p` con un ángulo medido desde la vertical hacia arriba.
function up(p, len, deg) {
  return [p[0] + len * Math.sin(rad(deg)), p[1] - len * Math.cos(rad(deg))];
}

// Avanza `len` desde `p` con un ángulo medido desde la horizontal hacia adelante.
function fwd(p, len, deg) {
  return [p[0] + len * Math.cos(rad(deg)), p[1] + len * Math.sin(rad(deg))];
}

/**
 * Resuelve una pose de pie a coordenadas de articulación.
 * Acepta root en el tobillo o en la punta del pie: los ejercicios que pivotan
 * sobre el antepié (elevaciones de talón) sólo quedan bien si la punta es la
 * que está fija, porque es la que no se mueve del escalón.
 */
function solveStand(p) {
  const footDeg = p.foot ?? 0;
  let ankle;
  if (p.toe) {
    ankle = [
      p.toe[0] - SEG.toe * Math.cos(rad(footDeg)),
      p.toe[1] - SEG.toe * Math.sin(rad(footDeg)),
    ];
  } else {
    ankle = p.ankle;
  }
  const toe = fwd(ankle, SEG.toe, footDeg);
  const heel = fwd(ankle, -SEG.heel, footDeg);

  const knee = up(ankle, SEG.shin, p.shin ?? 0);
  const hip = up(knee, SEG.thigh, p.thigh ?? 0);
  const sh = up(hip, SEG.trunk, p.trunk ?? 0);
  const head = up(sh, SEG.neck, (p.trunk ?? 0) + (p.neck ?? 0));
  const el = up(sh, SEG.uarm, p.uarm ?? 180);
  const hand = up(el, SEG.farm, p.farm ?? 180);

  const out = { ankle, toe, heel, knee, hip, sh, head, el, hand };

  // Pierna de atrás opcional (búlgara, subida al cajón, peso muerto a una
  // pierna). Comparte cadera, así que sólo hace falta la cadena hacia abajo.
  // Mismo convenio absoluto que la pierna de apoyo: 180 = colgando recta.
  if (p.shin2 !== undefined || p.thigh2 !== undefined) {
    const knee2 = up(hip, SEG.thigh, p.thigh2 ?? 180);
    const ankle2 = up(knee2, SEG.shin, p.shin2 ?? 180);
    const f2 = p.foot2 ?? 0;
    out.knee2 = knee2;
    out.ankle2 = ankle2;
    out.toe2 = fwd(ankle2, SEG.toe, f2);
    out.heel2 = fwd(ankle2, -SEG.heel, f2);
  }
  return out;
}

function solve(pose) {
  return pose.mode === "raw" ? pose.joints : solveStand(pose);
}

// ── Interpolación ────────────────────────────────────────────────────────────

const EASE = {
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in: (t) => t * t,
  out: (t) => 1 - Math.pow(1 - t, 2),
  lin: (t) => t,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPt(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

// Jerarquía hueso a hueso: [padre, hijo]. La longitud no va aquí porque las
// poses raw traen coordenadas propias: se mide de cada pose resuelta.
const BONES = [
  ["ankle", "knee"],
  ["knee", "hip"],
  ["hip", "sh"],
  ["sh", "head"],
  ["sh", "el"],
  ["el", "hand"],
  ["ankle", "toe"],
  ["ankle", "heel"],
  ["hip", "knee2"],
  ["knee2", "ankle2"],
  ["ankle2", "toe2"],
  ["ankle2", "heel2"],
];

/**
 * Interpola dos poses ya resueltas, hueso a hueso.
 *
 * Interpolar coordenadas sueltas acorta los huesos: un segmento que gira
 * describe un arco y la recta entre extremos es una cuerda — a 90° de giro el
 * hueso mide el 71% a mitad de camino. Era el defecto más visible del motor
 * anterior: el pie de las elevaciones de talón se encogía hasta parecer un
 * muñón en mitad de cada repetición, y lo mismo le pasaba a los brazos en el
 * press y a la tibia en el curl femoral.
 *
 * Aquí las articulaciones raíz (el tobillo, en las poses de pie) se
 * interpolan como posición, y cada hueso se reconstruye desde su padre ya
 * interpolado girando su ángulo por el camino corto. El largo queda constante
 * por construcción. Si una articulación no tiene cadena completa en ambas
 * poses (primeros planos como el arco del pie), cae a posición directa.
 */
function blendPose(A, B, t) {
  const out = {};
  const done = new Set();

  function resolve(j) {
    if (done.has(j)) return out[j];
    done.add(j);
    let parent = null;
    for (const [p, c] of BONES) {
      if (c === j && A[c] && B[c] && A[p] && B[p]) {
        parent = p;
        break;
      }
    }
    if (!parent) return (out[j] = lerpPt(A[j], B[j], t));

    const P = resolve(parent);
    const aA = Math.atan2(A[j][1] - A[parent][1], A[j][0] - A[parent][0]);
    const aB = Math.atan2(B[j][1] - B[parent][1], B[j][0] - B[parent][0]);
    let d = aB - aA;
    while (d > Math.PI) d -= 2 * Math.PI; // camino corto: 350°→10° gira 20°, no 340°
    while (d < -Math.PI) d += 2 * Math.PI;
    const lenA = Math.hypot(A[j][0] - A[parent][0], A[j][1] - A[parent][1]);
    const lenB = Math.hypot(B[j][0] - B[parent][0], B[j][1] - B[parent][1]);
    // Largo fijo si ambas poses coinciden (el caso normal, y todas las de
    // ángulos); transición lineal si una pose raw se escribió a mano con otra
    // medida, para que los extremos de ambas poses se respeten exactos.
    const len = Math.abs(lenA - lenB) < 0.75 ? lenA : lerp(lenA, lenB, t);
    const ang = aA + d * t;
    return (out[j] = [P[0] + len * Math.cos(ang), P[1] + len * Math.sin(ang)]);
  }

  for (const j of Object.keys(A)) if (B[j]) resolve(j);
  return out;
}

// ── Línea de tiempo ──────────────────────────────────────────────────────────

/**
 * Convierte la spec en una línea de tiempo explícita: lista de tramos
 * {from, to, ms, ease} y pausas al llegar a cada pose.
 *
 * Requisitos que el bucle anterior no cumplía:
 *   1. El recorrido de vuelta (ping-pong) se anima hasta volver a la pose
 *      inicial. Antes el ciclo terminaba en la penúltima visita y saltaba de
 *      golpe a la inicial: en los ejercicios de dos poses (pallof, slrdl,
 *      footdome) era un teletransporte de la pose final a la inicial en cada
 *      repetición.
 *   2. El ciclo ('cycle') también anima su tramo de cierre (última pose →
 *      primera): boxjump terminaba de pie sobre el cajón y reaparecía en el
 *      suelo.
 *
 * Con spec.weights (números relativos) cada tramo dura lo que el gesto real:
 * bajar una sentadilla más lento que subirla. spec.weightsBack hace lo mismo
 * con los tramos de vuelta; si falta, se usan los de ida en espejo.
 * spec.holds (ms) pausa la figura al llegar a cada pose — el "un segundo
 * arriba" que distingue una repetición de un péndulo.
 */
function buildTimeline(spec, n) {
  const wFwd = spec.weights || [];
  const wBack = spec.weightsBack || wFwd.slice().reverse();
  const eFwd = spec.ease || [];
  const eBack = spec.easeBack || eFwd.slice().reverse();
  const holds = spec.holds || [];
  const duration = spec.duration || 2600;

  const segs = []; // {from, to, weight, ms, ease}
  const stops = []; // {pose, ms} — pausa al llegar a esa pose

  if (spec.loop === "cycle") {
    const ws = spec.weights || [];
    const es = spec.ease || [];
    for (let i = 0; i < n; i++) {
      segs.push({ from: i, to: (i + 1) % n, weight: ws[i] ?? 1, ease: EASE[es[i]] || EASE.io });
      stops.push({ pose: i, ms: holds[i] || 0 });
    }
    const totalW = segs.reduce((s, x) => s + x.weight, 0);
    for (const s of segs) s.ms = (duration * s.weight) / totalW;
  } else {
    // Ida: 0→1→…→n−1. Vuelta: n−1→…→0. Cada stop se empareja con el tramo que
    // le SIGUE, así que el orden de los stops es el de las poses visitadas:
    // P0…Pn−1 y de regreso Pn−2…P0. La pausa de la pose profunda la aporta el
    // primer stop de la vuelta — agregarla también aquí la duplicaba y, con
    // ella, el regreso de golpe al fondo cada ciclo.
    const sumF = Math.max(
      1e-6,
      wFwd.reduce((s, x) => s + (x ?? 1), 0),
    );
    const sumB = Math.max(
      1e-6,
      wBack.reduce((s, x) => s + (x ?? 1), 0),
    );
    for (let i = 0; i < n - 1; i++) {
      segs.push({
        from: i,
        to: i + 1,
        ms: (duration * (wFwd[i] ?? 1)) / sumF,
        ease: EASE[eFwd[i]] || EASE.io,
      });
      stops.push({ pose: i, ms: holds[i] || 0 });
    }
    for (let i = 0; i < n - 1; i++) {
      segs.push({
        from: n - 1 - i,
        to: n - 2 - i,
        ms: (duration * (wBack[i] ?? 1)) / sumB,
        ease: EASE[eBack[i]] || EASE.io,
      });
      stops.push({ pose: n - 1 - i, ms: holds[n - 1 - i] || 0 });
    }
    stops.push({ pose: 0, ms: holds[0] || 0 });
  }

  const period = segs.reduce((s, x) => s + x.ms, 0) + stops.reduce((s, x) => s + x.ms, 0);
  return { segs, stops, period };
}

/**
 * Dado un instante de la línea de tiempo, devuelve el par de poses a
 * interpolar y su progreso. La línea de tiempo alterna pausas y tramos; en
 * pausa el progreso es 0 sobre el tramo que sigue (la figura queda congelada
 * en la pose a la que llegó).
 */
function sampleTimeline(tl, elapsed) {
  let t = elapsed;
  for (let i = 0; i < tl.segs.length; i++) {
    const stop = tl.stops[i];
    if (stop.ms > 0) {
      if (t < stop.ms) return { from: stop.pose, to: stop.pose, k: 0 };
      t -= stop.ms;
    }
    const seg = tl.segs[i];
    if (t < seg.ms) return { from: seg.from, to: seg.to, k: seg.ease(t / seg.ms) };
    t -= seg.ms;
  }
  // El último stop (vuelta a la pose inicial) cierra el ciclo.
  const last = tl.stops[tl.stops.length - 1];
  return { from: last.pose, to: last.pose, k: 0 };
}

// ── Dibujo ───────────────────────────────────────────────────────────────────

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/*
 * Tres categorías visuales, y la distinción importa más de lo que parece: el
 * atleta mira la figura para saber qué tiene que ir a buscar antes de empezar.
 *
 *   (sin kind)  escenografía — suelo, pared, poste de anclaje. Gris.
 *   kind:'gear' aparato — banco, cajón, escalón, máquina, banda. Ámbar en
 *               contorno: se nota que hace falta, sin gritar.
 *   kind:'load' la carga misma — mancuerna, disco. Ámbar sólido, igual que
 *               .load-plate, que es lo que ya dibuja la barra y las mancuernas.
 */
function propClass(p, base) {
  return p.kind === "gear" || p.kind === "load" ? `${base} ${p.kind}` : base;
}

function drawProps(svg, props = []) {
  for (const p of props) {
    if (p.type === "box") {
      svg.appendChild(
        el("rect", {
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          rx: 1.5,
          class: propClass(p, "prop"),
        }),
      );
    } else if (p.type === "line") {
      svg.appendChild(
        el("line", {
          x1: p.x1,
          y1: p.y1,
          x2: p.x2,
          y2: p.y2,
          class: propClass(p, "prop-line"),
        }),
      );
    }
  }
}

function polyline(pts, cls) {
  return el("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: cls });
}

// Grosor de cada hueso en su extremo proximal y distal. Un muslo que sale ancho
// de la cadera y se estrecha en la rodilla lee como una pierna; el mismo hueso
// con grosor constante lee como un palo.
const BONE = {
  thigh: [7.6, 5.4],
  shin: [5.2, 3.4],
  uarm: [4.8, 3.6],
  farm: [3.6, 2.8],
  neck: [4.2, 4.6],
};

/**
 * Hueso como polígono cónico entre dos puntos, más un círculo en cada extremo
 * para que las articulaciones queden redondeadas y los huesos contiguos se
 * fundan sin costura visible.
 */
function bone(g, a, b, [wa, wb], cls = "limb") {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [
    [a[0] + nx * wa, a[1] + ny * wa],
    [b[0] + nx * wb, b[1] + ny * wb],
    [b[0] - nx * wb, b[1] - ny * wb],
    [a[0] - nx * wa, a[1] - ny * wa],
  ];
  g.appendChild(el("polygon", { points: pts.map((p) => p.join(",")).join(" "), class: cls }));
  g.appendChild(el("circle", { cx: a[0], cy: a[1], r: wa, class: cls }));
  g.appendChild(el("circle", { cx: b[0], cy: b[1], r: wb, class: cls }));
}

/** Tronco: hombros anchos, cintura estrecha. */
function torso(g, sh, hip, s = 1, cls = "limb") {
  const dx = hip[0] - sh[0];
  const dy = hip[1] - sh[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ws = 9.5 * s;
  const wh = 7.2 * s;
  const mx = (sh[0] + hip[0]) / 2;
  const my = (sh[1] + hip[1]) / 2;
  const wm = 7.0 * s; // ligera cintura a media altura
  const pts = [
    [sh[0] + nx * ws, sh[1] + ny * ws],
    [mx + nx * wm, my + ny * wm],
    [hip[0] + nx * wh, hip[1] + ny * wh],
    [hip[0] - nx * wh, hip[1] - ny * wh],
    [mx - nx * wm, my - ny * wm],
    [sh[0] - nx * ws, sh[1] - ny * ws],
  ];
  g.appendChild(el("polygon", { points: pts.map((p) => p.join(",")).join(" "), class: cls }));
  g.appendChild(el("circle", { cx: sh[0], cy: sh[1], r: ws, class: cls }));
  g.appendChild(el("circle", { cx: hip[0], cy: hip[1], r: wh, class: cls }));
}

/** Pie: cuña del talón a la punta, más gruesa atrás. */
function foot(g, heel, ankle, toe, s = 1, cls = "limb") {
  bone(g, heel, ankle, [3.4 * s, 3.4 * s], cls);
  bone(g, ankle, toe, [3.4 * s, 2.2 * s], cls);
}

/**
 * Primer plano del pie (sólo talón–tobillo–punta): dos huesos finos leen como
 * una V mayúscula; una curva continua con el grosor de una huella lee como el
 * arco que se eleva, que es lo que el ejercicio quiere enseñar. La recta
 * punteada talón–punta es la referencia: la distancia entre la curva y esa
 * línea ES la altura del arco, y sin ella el ojo no tiene contra qué medir.
 */
function archCloseup(g, heel, ankle, toe, s = 1) {
  g.appendChild(
    el("line", {
      x1: heel[0],
      y1: heel[1],
      x2: toe[0],
      y2: toe[1],
      class: "arch-base",
    }),
  );
  const cx = 2 * ankle[0] - (heel[0] + toe[0]) / 2;
  const cy = 2 * ankle[1] - (heel[1] + toe[1]) / 2;
  g.appendChild(
    el("path", {
      d: `M ${heel[0]} ${heel[1]} Q ${cx} ${cy} ${toe[0]} ${toe[1]}`,
      class: "limb arch",
      style: `stroke-width:${6.5 * s}`,
    }),
  );
  g.appendChild(el("circle", { cx: ankle[0], cy: ankle[1], r: 3.2 * s, class: "limb" }));
}

/**
 * Pinta un cuadro. Devuelve el grupo <g> para poder reemplazarlo entero en el
 * siguiente frame: es más barato y más simple que ir moviendo cada nodo.
 *
 * spec.width escala el grosor de toda la figura sin tocar los ángulos ni las
 * poses: es la perilla de "muñeco más delgado", de una sola pieza para todos
 * los huesos, tronco, pies, cabeza y arco.
 *
 * El default (0.82) salió de una comparativa a tres anchos con el estudio
 * visual de widthstudy.html: al 65% la cabeza queda chica, las articulaciones
 * se ven puntiagudas y la barra/mancuernas dominan la silueta; al 100% la
 * figura lee tosca. El 82% mantiene las articulaciones legibles a tamaño de
 * celular (~200 px) y la pierna trasera gris no se pierde contra el fondo.
 */
const DEFAULT_WIDTH = 0.82;

function renderFrame(j, spec, trailPts) {
  const g = el("g", {});
  const S = spec.width ?? DEFAULT_WIDTH;
  // Tolerante a articulaciones ausentes: los primeros planos (el arco del pie)
  // sólo declaran tobillo, talón y punta, y no deben pintar un cuerpo degenerado.
  const has = (...k) => k.every((x) => j[x]);

  // Estela de la trayectoria (barra, mano): detrás de la figura para que la
  // figura pase por encima y la estela se lea como el camino recorrido.
  if (trailPts && trailPts.length > 1) g.appendChild(polyline(trailPts, "trail"));

  if (j.knee2) {
    // La pierna de atrás se pinta primero y en un tono más apagado: sin eso las
    // dos piernas se confunden en una sola masa y no se entiende cuál trabaja.
    if (has("hip", "knee2"))
      bone(
        g,
        j.hip,
        j.knee2,
        BONE.thigh.map((w) => w * S),
        "limb far",
      );
    if (has("knee2", "ankle2"))
      bone(
        g,
        j.knee2,
        j.ankle2,
        BONE.shin.map((w) => w * S),
        "limb far",
      );
    if (has("heel2", "ankle2", "toe2")) foot(g, j.heel2, j.ankle2, j.toe2, S, "limb far");
  }

  if (has("heel", "ankle", "toe") && !j.knee) {
    archCloseup(g, j.heel, j.ankle, j.toe, S);
  } else {
    if (has("sh", "hip")) torso(g, j.sh, j.hip, S);
    if (has("hip", "knee"))
      bone(
        g,
        j.hip,
        j.knee,
        BONE.thigh.map((w) => w * S),
      );
    if (has("knee", "ankle"))
      bone(
        g,
        j.knee,
        j.ankle,
        BONE.shin.map((w) => w * S),
      );
    if (has("heel", "ankle", "toe")) foot(g, j.heel, j.ankle, j.toe, S);
    if (has("sh", "head"))
      bone(
        g,
        j.sh,
        j.head,
        BONE.neck.map((w) => w * S),
      );
    if (has("sh", "el"))
      bone(
        g,
        j.sh,
        j.el,
        BONE.uarm.map((w) => w * S),
      );
    if (has("el", "hand"))
      bone(
        g,
        j.el,
        j.hand,
        BONE.farm.map((w) => w * S),
      );

    if (j.head) {
      g.appendChild(el("circle", { cx: j.head[0], cy: j.head[1], r: SEG.head * S, class: "head" }));
    }
  }

  // Banda elástica. Se redibuja en cada frame porque un extremo va anclado y el
  // otro sigue a la mano: dibujarla estática escondería el estiramiento, que es
  // el ejercicio entero en un Pallof.
  if (spec.band) {
    // Cada extremo es o un punto fijo ([x, y], un anclaje) o el nombre de una
    // articulación, que es como la banda del monster walk se estira sola al
    // abrirse la pierna.
    const end = (e) => (typeof e === "string" ? j[e] : e);
    const a = end(spec.band.from);
    const b = end(spec.band.to);
    if (a && b) {
      // lift sube los dos extremos: una banda anclada al tobillo se lleva en
      // realidad sobre la pantorrilla baja, y ahí además no se confunde con la
      // silueta del pie.
      const lift = spec.band.lift || 0;
      g.appendChild(
        el("line", {
          x1: a[0],
          y1: a[1] - lift,
          x2: b[0],
          y2: b[1] - lift,
          class: "band",
        }),
      );
    }
  }

  // Carga. Va al final para que se vea encima de las manos.
  if (spec.load === "bar") {
    const anchor = spec.loadAt === "sh" ? j.sh : j.hand;
    g.appendChild(
      el("line", {
        x1: anchor[0] - 15,
        y1: anchor[1],
        x2: anchor[0] + 15,
        y2: anchor[1],
        class: "load-bar",
      }),
    );
    for (const dx of [-13, 13]) {
      g.appendChild(
        el("rect", {
          x: anchor[0] + dx - 1.6,
          y: anchor[1] - 6,
          width: 3.2,
          height: 12,
          rx: 1,
          class: "load-plate",
        }),
      );
    }
  } else if (spec.load === "db") {
    g.appendChild(
      el("rect", {
        x: j.hand[0] - 2,
        y: j.hand[1] - 5.5,
        width: 4,
        height: 11,
        rx: 1.4,
        class: "load-plate",
      }),
    );
  }

  return g;
}

/**
 * Anima un ejercicio dentro de un <svg>.
 * Recorre las poses de ida y vuelta (ping-pong) o en ciclo (spec.loop ===
 * 'cycle') según buildTimeline; los tiempos por tramo y las pausas salen de
 * spec.weights / spec.holds, y spec.trail marca la articulación cuya
 * trayectoria se dibuja (la barra en las sentadillas, la mano en el peso
 * muerto).
 */
export function animate(svg, spec) {
  const poses = spec.poses.map(solve);
  const n = poses.length;
  // Con margen arriba: al exagerar la altura de los saltos (pogos, cajón) la
  // cabeza se salía por el borde superior y la figura aparecía decapitada.
  const view = spec.view || "-3 -20 136 142";
  svg.setAttribute("viewBox", view);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const tl = buildTimeline(spec, n);

  let group = null;
  let raf = null;
  const t0 = performance.now();
  const trail = [];
  const TRAIL_MAX = 34;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function draw(joints) {
    if (spec.trail && joints[spec.trail]) {
      const p = joints[spec.trail];
      const last = trail[trail.length - 1];
      // Sólo se agrega un punto si se movió: en las pausas la estela congelada
      // no debe engordar con puntos duplicados.
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.8) {
        trail.push(p);
        if (trail.length > TRAIL_MAX) trail.shift();
      }
    }
    const next = renderFrame(joints, spec, trail);
    if (group) svg.replaceChild(next, group);
    else svg.appendChild(next);
    group = next;
  }

  function frame(now) {
    const base = svg.querySelector(".base");
    if (!base) {
      // El <svg> se reconstruye entero la primera vez: fondo, suelo y props.
      const b = el("g", { class: "base" });
      if (spec.ground !== false) {
        b.appendChild(
          el("line", {
            x1: 4,
            y1: spec.groundY ?? 104,
            x2: 126,
            y2: spec.groundY ?? 104,
            class: "ground",
          }),
        );
      }
      svg.appendChild(b);
      drawProps(b, spec.props);
    }

    let joints;
    if (reduced) {
      // Sin movimiento: la pose de trabajo (la última), que es la que enseña
      // algo — en una sentadilla el fondo, no el arranque.
      joints = poses[n - 1];
    } else {
      // El módulo se normaliza a positivo porque `now` puede ser ANTERIOR a t0:
      // el timestamp que recibe el callback es el del inicio del frame en curso,
      // y si animate() se llamó desde un click a mitad de ese mismo frame, la
      // resta sale negativa. Sin esto, el muestreo de la línea de tiempo se iba
      // de rango y reventaba la animación en silencio.
      const elapsed = (((now - t0) % tl.period) + tl.period) % tl.period;
      const s = sampleTimeline(tl, elapsed);
      joints = s.from === s.to ? poses[s.from] : blendPose(poses[s.from], poses[s.to], s.k);
    }
    draw(joints);

    if (!reduced) raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export { SEG };
