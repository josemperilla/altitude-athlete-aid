/*
 * Guía de gimnasio — rediseño 2026-09.
 *
 * Lee /plan.json (que escribe tools/export_gym_plan.py en la corrida semanal)
 * y arma cuatro vistas: Hoy, Sesiones, Plan y Reglas.
 *
 * Novedades del rediseño:
 *   - Cada ejercicio trae su guía de carga (loads.js): arranque, progresión
 *     y techo. Es la respuesta a "¿cuánto me pongo?" sin abrir otra app.
 *   - En Hoy los ejercicios se marcan como hechos (check), con progreso de
 *     sesión y persistencia por fecha en localStorage: entre series, la
 *     interacción número uno es saber qué falta.
 *   - Las animaciones siguen arrancando sólo cuando el ejercicio está en
 *     pantalla y parándose al salir (IntersectionObserver).
 */
import { animate } from './figure.js';
import { POSES } from './poses.js';
import { PHOTOS, PHOTO_CAVEATS } from './photos.js';
import { WEIGHT_GUIDE, PICK_RULES } from './loads.js';

const $ = (sel) => document.querySelector(sel);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Fecha local sin zona horaria: new Date('2026-09-07') se interpreta como UTC y
// en Bogotá (UTC-5) retrocede un día, que es justo el bug que haría mostrar la
// sesión equivocada.
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const fmtDay = (iso) => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid) n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return n;
}

// ── Marca de ejercicios hechos ───────────────────────────────────────────────

// La marca vive en localStorage por fecha+sesión+ejercicio: la guía se abre en
// el celular entre series y al día siguiente el estado ya no importa — cada
// día arranca en cero sin tocar un botón de "reiniciar".
const DONE_KEY = 'gym.done.v1';

function loadDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY)) || {}; } catch { return {}; }
}
function saveDone(map) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(map)); } catch { /* privado: sin storage no hay check, la guía sigue viva */ }
}
const doneMap = loadDone();
const doneKey = (date, code, idx) => `${date}|${code}|${idx}`;

// ── Animación ────────────────────────────────────────────────────────────────

/**
 * Caja de animación de un ejercicio: la figura articulada de figure.js.
 * El SVG sólo anima cuando está en pantalla (IntersectionObserver): con una
 * sesión entera desplegada habría una decena de requestAnimationFrame corriendo
 * a la vez para animaciones que nadie estaba mirando.
 */
function animationBox(item) {
  const spec = POSES[item.anim];
  if (!spec) return null;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Animación: ${item.name}`);
  const box = h('div', { class: 'anim' }, svg);

  let stop = null;
  return {
    node: box,
    start: () => { if (!stop) stop = animate(svg, spec); },
    stop: () => { if (stop) { stop(); stop = null; svg.replaceChildren(); } },
  };
}

// Un solo observador para toda la página: crear uno por ejercicio es gasto sin
// contrapartida.
const visible = new WeakMap();
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const ctl = visible.get(e.target);
    if (!ctl) continue;
    if (e.isIntersecting) ctl.start(); else ctl.stop();
  }
}, { rootMargin: '120px' });

// ── Guía de carga ────────────────────────────────────────────────────────────

function loadCompact(item) {
  const g = WEIGHT_GUIDE[item.anim];
  if (!g) return null;
  return h('div', { class: 'ex-load' },
    h('span', { class: 'lb' }, 'Cuánto cargar'),
    h('span', {}, h('b', { text: g.arranque }), ' ', g.inicio),
    h('span', { class: 'lb' }, 'Progresión'),
    h('span', {}, g.progresion),
  );
}

function loadFull(item) {
  const g = WEIGHT_GUIDE[item.anim];
  if (!g) return null;
  const fields = [
    ['Arranque', g.arranque], ['Regla', g.inicio], ['Progresión', g.progresion],
    ['Techo', g.techo], ['Si falla', g.aviso],
  ];
  return h('div', { class: 'load-full' },
    h('h4', { text: 'Guía de carga' }),
    h('dl', {}, fields.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
  );
}

function pickRulesPanel() {
  const btn = h('button', { class: 'pick-head', type: 'button', 'aria-expanded': 'false' },
    'Cómo elegir el peso',
    h('span', { class: 'chev', text: 'reglas ▾' }));
  const body = h('div', { class: 'pick-body' },
    h('ol', {}, PICK_RULES.map((r) => h('li', { text: r }))));
  const wrap = h('div', { class: 'pick' }, btn, body);
  btn.addEventListener('click', () => {
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('.chev').textContent = open ? 'reglas ▴' : 'reglas ▾';
  });
  return wrap;
}

// ── Ejercicio ────────────────────────────────────────────────────────────────

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';

/**
 * Fila de ejercicio. `checkKey` (sólo en Hoy) activa el marcar-hecho; en
 * Sesiones la fila es de consulta y no trae check.
 */
function exerciseNode(item, { checkKey } = {}) {
  const hasDetail = Boolean(item.id);
  const wrap = h('article', { class: `ex${checkKey ? '' : ' nochk'}` });

  if (checkKey && doneMap[checkKey]) wrap.classList.add('done');

  const check = checkKey
    ? h('button', {
        class: 'check', type: 'button',
        'aria-label': `Marcar ${item.name} como hecho`,
        'aria-pressed': wrap.classList.contains('done') ? 'true' : 'false',
      })
    : null;
  if (check) {
    const icon = document.createElement('span');
    icon.innerHTML = CHECK_SVG;
    check.appendChild(icon);
  }

  if (check) {
    check.addEventListener('click', () => {
      const on = !wrap.classList.contains('done');
      wrap.classList.toggle('done', on);
      check.setAttribute('aria-pressed', String(on));
      if (on) doneMap[checkKey] = 1; else delete doneMap[checkKey];
      saveDone(doneMap);
      updateProgress(checkKey.split('|')[0], checkKey.split('|')[1]);
    });
  }

  wrap.appendChild(h('div', { class: 'ex-row' },
    check,
    h('div', { class: 'ex-id' },
      h('div', { class: 'nm', text: item.name }),
      item.target ? h('p', { class: 'tgt', text: item.target }) : null),
    h('div', { class: 'ex-r' },
      h('span', { class: 'pres', text: item.prescription }),
      item.load ? h('span', { class: 'loadc', text: item.load }) : null),
  ));

  // La animación va siempre visible. Estuvo detrás de un botón "ver técnica" y
  // el resultado era una lista de ejercicios sin una sola animación a la vista:
  // nadie toca un botón para ver algo que no sabe que está ahí.
  const anim = animationBox(item);
  if (anim) {
    wrap.appendChild(anim.node);
    visible.set(anim.node, anim);
    seen.observe(anim.node);
  }

  if (WEIGHT_GUIDE[item.anim]) wrap.appendChild(loadCompact(item));

  if (!hasDetail) return wrap;

  const hasMore = item.cues?.length || item.errors?.length || item.alt || WEIGHT_GUIDE[item.anim];
  if (!hasMore) return wrap;

  const btn = h('button', { class: 'more-btn', type: 'button', 'aria-expanded': 'false' },
    'Técnica · carga · fotos ▾');
  const body = h('div', { class: 'ex-body' });
  wrap.append(btn, body);

  let built = false;
  btn.addEventListener('click', () => {
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Ocultar ▴' : 'Técnica · carga · fotos ▾';
    if (open && !built) {
      built = true;
      const tips = h('div', { class: 'tips' });
      if (item.cues?.length) {
        tips.appendChild(h('h4', { text: 'Cómo hacerlo bien' }));
        tips.appendChild(h('ul', {}, item.cues.map((c) => h('li', { text: c }))));
      }
      if (item.errors?.length) {
        tips.appendChild(h('h4', { class: 'bad', text: 'Errores que se cometen' }));
        tips.appendChild(h('ul', {}, item.errors.map((c) => h('li', { text: c }))));
      }
      if (tips.childNodes.length) body.appendChild(tips);
      if (item.alt) body.appendChild(h('div', { class: 'alt', text: item.alt }));

      // Guía completa de carga con techo y aviso, que no cabe en el compacto.
      const lf = loadFull(item);
      if (lf) body.appendChild(lf);

      // Foto real de referencia, quieta: dos posiciones que dejan comparar
      // inicio y final con una persona de verdad.
      if (PHOTOS[item.anim]) {
        body.appendChild(h('h4', { class: 'ref-h', text: 'Referencia en foto' }));
        body.appendChild(h('div', { class: 'refpair' },
          h('figure', {},
            h('img', { src: `/ex/${item.anim}-0.jpg`, alt: `${item.name}, inicio`, loading: 'lazy' }),
            h('figcaption', { text: 'Inicio' })),
          h('figure', {},
            h('img', { src: `/ex/${item.anim}-1.jpg`, alt: `${item.name}, final`, loading: 'lazy' }),
            h('figcaption', { text: 'Final' })),
        ));
        const caveat = PHOTO_CAVEATS[item.anim];
        if (caveat) body.appendChild(h('p', { class: 'caveat', text: caveat }));
      }
    }
  });

  return wrap;
}

// ── Tarjeta de sesión ────────────────────────────────────────────────────────

function sessionCard(session, { date, note, scale, checkable } = {}) {
  const card = h('section', { class: 'session', 'data-code': session.code });

  // Claves de check por ejercicio, estables por fecha+sesión+orden.
  let itemIdx = 0;
  const keyOf = () => `${date}|${session.code}|${itemIdx++}`;

  const prog = checkable
    ? h('div', { class: 'session-prog' },
        h('div', { class: 'bar' }, h('i', {})),
        h('span', { class: 'num' }))
    : null;

  const head = h('div', { class: 'session-head' },
    h('div', { class: 'sid' },
      h('span', { class: 'code', text: session.label || `Sesión ${session.code}` }),
      h('span', { class: 'meta', text: [date ? `${session.weekday} ${fmtDay(date)}` : session.weekday, `~${session.duration_min} min`].join(' · ') }),
    ),
    h('h3', { text: session.title }),
    note ? h('p', { class: 'summary', text: note }) : null,
    h('p', { class: 'summary', text: session.summary }),
    prog,
  );
  card.appendChild(head);

  for (const block of session.blocks) {
    card.appendChild(h('div', { class: 'block-head' },
      h('span', { text: block.name }),
      h('span', { class: 'mins mono', text: `${block.minutes} min` }),
    ));
    if (block.note) card.appendChild(h('div', { class: 'block-note', text: block.note }));
    for (const item of block.items) {
      const shown = { ...item };
      // La semana pico recorta series; mostrar la prescripción original ahí sería
      // decirle al atleta que haga justo lo que el plan quiere evitar.
      if (scale && scale < 1) {
        shown.prescription = item.prescription.replace(/^(\d+)\s*×/, (m, n) => {
          const reduced = Math.max(1, Math.round(Number(n) * scale));
          return `${reduced} ×`;
        });
      }
      card.appendChild(exerciseNode(shown, { checkKey: checkable ? keyOf() : undefined }));
    }
  }

  if (prog) {
    prog.dataset.date = date;
    prog.dataset.code = session.code;
    updateProgress(date, session.code);
  }
  return card;
}

/**
 * Refresca la barra y el conteo de la sesión (fecha+code) del DOM tras marcar
 * un ejercicio. Recorre las filas de la tarjeta porque el estado vive en las
 * clases, no en un modelo: la fuente de verdad sigue siendo doneMap.
 */
function updateProgress(date, code) {
  const prog = document.querySelector(`.session-prog[data-date="${date}"][data-code="${code}"]`);
  if (!prog) return;
  const card = prog.closest('.session');
  const total = card.querySelectorAll('.ex .check').length;
  const done = card.querySelectorAll('.ex.done .check').length;
  prog.querySelector('.bar i').style.width = total ? `${(done / total) * 100}%` : '0';

  // Al completar, el contador se cambia por la etiqueta; al desmarcar, vuelve.
  prog.querySelector('.num, .done-tag')?.remove();
  prog.appendChild(done === total && total > 0
    ? h('span', { class: 'done-tag', text: 'Completa ✓' })
    : h('span', { class: 'num', text: `${done}/${total}` }));
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function findScheduled(plan, iso) {
  for (const w of plan.weeks) {
    for (const s of w.sessions) if (s.date === iso) return { ...s, week: w };
  }
  return null;
}

function nextScheduled(plan, iso) {
  const all = plan.weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w })));
  return all.filter((s) => s.date >= iso).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function dayItems(plan, date, isRace) {
  const cal = plan.calendar.find((c) => c.date === date);
  const gym = plan.weeks.flatMap((w) => w.sessions).find((s) => s.date === date);
  const items = h('div', { class: 'items' });
  if (isRace) {
    items.appendChild(h('div', { class: 'item' },
      h('span', { class: 'k race', text: 'Carrera' }), 'Medio maratón'));
  }
  for (const r of cal?.running || []) {
    items.appendChild(h('div', { class: 'item' },
      h('span', { class: 'k run', text: 'Correr' }), r.name,
      r.detail ? h('span', { class: 'detail', text: r.detail }) : null));
  }
  for (const c of cal?.cycling || []) {
    items.appendChild(h('div', { class: 'item' },
      h('span', { class: 'k bike', text: 'Bici' }), c.name,
      c.detail ? h('span', { class: 'detail', text: c.detail }) : null));
  }
  if (gym) {
    const s = plan.sessions[gym.session];
    items.appendChild(h('div', { class: 'item' },
      h('span', { class: 'k gym', text: `Gym ${gym.session}` }), s.title,
      h('span', { class: 'detail', text: gym.note || `~${s.duration_min} min` })));
  }
  return items.childNodes.length ? items : null;
}

function dayNode(plan, iso, { isRace = false } = {}) {
  const d = parseDate(iso);
  return h('div', { class: `day${isRace ? ' is-race' : ''}` },
    h('div', { class: 'd' },
      h('b', { text: String(d.getDate()) }),
      `${DIAS[d.getDay()]} ${MESES[d.getMonth()]}`),
    dayItems(plan, iso, isRace),
  );
}

function renderHoy(plan) {
  const root = $('#v-hoy');
  root.replaceChildren();
  const iso = todayISO();

  const today = findScheduled(plan, iso);
  const target = today || nextScheduled(plan, iso);

  if (!target) {
    root.appendChild(h('h2', { class: 'sec', text: 'Hoy' }));
    root.appendChild(h('div', { class: 'empty', text: 'El bloque de fuerza terminó. A correr.' }));
    return;
  }

  root.appendChild(h('h2', {
    class: 'sec',
    text: today ? 'Hoy toca gimnasio' : `Próxima sesión · ${fmtDay(target.date)}`,
  }));
  root.appendChild(sessionCard(plan.sessions[target.session], {
    date: target.date, note: target.note, scale: target.scale, checkable: Boolean(today),
  }));
  root.appendChild(pickRulesPanel());

  // Qué más hay ese día: si el miércoles hay tempo, hay que verlo antes de
  // decidir a qué hora se entra al gimnasio.
  const items = dayItems(plan, target.date, target.date === plan.race_date);
  if (items && items.childNodes.length) {
    root.appendChild(h('h2', { class: 'sec', text: 'Ese mismo día, además' }));
    const other = [...items.childNodes].filter((n) => !n.querySelector('.k.gym'));
    if (other.length) {
      root.appendChild(h('div', {}, h('div', { class: 'items' }, other)));
      root.appendChild(h('p', {
        class: 'week-intent',
        text: 'Corre primero. El gimnasio va después, con seis horas de separación si puedes.',
      }));
    }
  }
}

/* Un selector segmentado y su tarjeta. Se saca a una función porque la vista
   monta dos: las del bloque y las de casa. Más de tres botones en una sola fila
   no caben en un celular. */
function sessionPicker(plan, codes) {
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const stage = h('div', {});

  const show = (code) => {
    stage.replaceChildren(sessionCard(plan.sessions[code]));
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('aria-selected', String(b.dataset.code === code));
    }
  };

  for (const code of codes) {
    const s = plan.sessions[code];
    const b = h('button', {
      type: 'button', role: 'tab', 'data-code': code,
      'aria-selected': String(code === codes[0]),
    }, s.label || `Sesión ${code}`, h('small', { text: s.title.split(',')[0] }));
    b.addEventListener('click', () => show(code));
    seg.appendChild(b);
  }

  show(codes[0]);
  return [seg, stage];
}

function renderSesiones(plan) {
  const root = $('#v-sesiones');
  root.replaceChildren();

  root.appendChild(h('h2', { class: 'sec', text: 'Las sesiones del bloque' }));
  root.append(...sessionPicker(plan, ['A', 'B', 'M'].filter((c) => plan.sessions[c])));

  // Las de casa van en su propia sección a propósito: no están agendadas, no
  // cuentan para el progreso del bloque y se eligen por cómo amaneciste, no por
  // fecha. Meterlas bajo "las sesiones del bloque" sería mentir.
  const casa = ['C1', 'C2'].filter((c) => plan.sessions[c]);
  if (casa.length) {
    root.appendChild(h('h2', { class: 'sec', text: 'En casa, cuando te sobre energía' }));
    root.append(...sessionPicker(plan, casa));
  }

  root.appendChild(pickRulesPanel());
}

function renderPlan(plan) {
  const root = $('#v-plan');
  root.replaceChildren();
  const iso = todayISO();

  root.appendChild(h('h2', { class: 'sec', text: 'Semana a semana hasta la carrera' }));

  for (const week of plan.weeks) {
    const wk = h('div', { class: 'week' });
    wk.appendChild(h('div', { class: 'week-head' },
      h('span', { class: 'phase', text: week.phase }),
      h('span', { class: 'rw', text: week.runna_week }),
      h('span', { class: 'range', text: `${fmtDay(week.start)} – ${fmtDay(week.end)}` }),
    ));
    wk.appendChild(h('p', { class: 'week-intent', text: week.intent }));
    wk.appendChild(h('p', { class: 'week-loading', text: week.loading }));

    const start = parseDate(week.start);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const dISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isRace = dISO === plan.race_date;
      const cal = plan.calendar.find((c) => c.date === dISO);
      const gym = week.sessions.find((s) => s.date === dISO);
      if (!cal && !gym && !isRace) continue;
      wk.appendChild(dayNode(plan, dISO, { isRace }));
    }
    root.appendChild(wk);
  }

  if (plan.calendar.every((c) => c.date < iso)) {
    root.appendChild(h('div', {
      class: 'empty',
      text: 'El calendario de carrera está desactualizado. Corre run_weekly.sh.',
    }));
  }
}

function renderReglas(plan) {
  const root = $('#v-reglas');
  root.replaceChildren();
  root.appendChild(h('h2', { class: 'sec', text: 'Valen más que los ejercicios' }));
  root.appendChild(h('ol', { class: 'rules' },
    plan.rules.map((r) => h('li', {}, h('b', { text: r.rule }), h('span', { text: r.detail })))));
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function setupTabs() {
  const tabs = [...document.querySelectorAll('nav.tabs button')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.setAttribute('aria-selected', String(t === tab));
      for (const v of document.querySelectorAll('.view')) v.classList.remove('active');
      $(`#v-${tab.dataset.view}`).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'instant' });
      location.hash = tab.dataset.view;
    });
  }
  const initial = location.hash.slice(1);
  const match = tabs.find((t) => t.dataset.view === initial);
  if (match) match.click();
}

async function main() {
  let plan;
  try {
    const res = await fetch('/plan.json', { cache: 'no-cache' });
    plan = await res.json();
  } catch {
    $('#v-hoy').appendChild(h('div', {
      class: 'empty',
      text: 'No se pudo cargar el plan. Revisa la conexión y recarga.',
    }));
    return;
  }

  const iso = todayISO();
  const days = daysBetween(iso, plan.race_date);
  $('#cDays').textContent = days >= 0 ? days : '0';

  // Sesiones restantes + progreso del bloque completo para la barra de la
  // cabecera: pasadas / totales según la fecha de cada sesión.
  const all = plan.weeks.flatMap((w) => w.sessions);
  const remaining = all.filter((s) => s.date >= iso).length;
  $('#cSessions').textContent = remaining;
  const past = all.filter((s) => s.date < iso).length;
  const pct = all.length ? Math.round((past / all.length) * 100) : 0;
  $('#trackFill').style.width = `${pct}%`;
  $('#track').setAttribute('aria-valuenow', String(pct));

  $('#hTitle').textContent = 'Fuerza para la media maratón';
  const gen = plan.generated_at ? plan.generated_at.replace('T', ' ').slice(0, 16) : '—';
  $('#fMeta').textContent = `Plan actualizado el ${gen}` +
    (plan.athlete_state ? ` · estado: ${plan.athlete_state}` : '');

  renderHoy(plan);
  renderSesiones(plan);
  renderPlan(plan);
  renderReglas(plan);
  setupTabs();
}

main();
