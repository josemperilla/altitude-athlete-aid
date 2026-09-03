/*
 * Poses y tempo por ejercicio. Ver figure.js para el convenio de ángulos y
 * para cómo se interpretan los campos de tiempo.
 *
 * Regla al editar: cambia un ángulo a la vez y mira el resultado. Los segmentos
 * miden siempre lo mismo, así que si algo se ve raro es el ángulo, nunca el largo.
 *
 * Campos de tempo (todos opcionales; sin ellos el ejercicio va y vuelve a
 * velocidad uniforme):
 *   duration     — ms del recorrido de ida (y de vuelta, si no dice otra cosa).
 *   weights      — peso relativo de cada tramo de IDA. En los ejercicios que
 *                  empiezan arriba, la ida es la fase excéntrica: bajarse
 *                  despacio es `weights` alto.
 *   weightsBack  — pesos de la VUELTA. Si falta, se usan los de ida en espejo.
 *                  La vuelta suele ser el esfuerzo concéntrico y va más rápida.
 *   holds        — pausa en ms al LLEGAR a cada pose. El segundo de pausa
 *                  arriba y el toque abajo son lo que separan una repetición
 *                  de un péndulo.
 *   ease/easeBack— 'io' (por defecto), 'in', 'out' o 'lin' por tramo. Los
 *                  saltos usan 'out' al subir (el cuerpo se frena al llegar a
 *                  la cima) y 'in' al caer (la gravedad acelera).
 *   trail        — articulación cuya trayectoria se dibuja: la barra de la
 *                  sentadilla tiene que bajar y subir en una línea casi
 *                  vertical, y con la estela se ve si lo hace.
 */

const G = 104; // suelo

export const POSES = {
  squat: {
    load: "bar",
    loadAt: "sh",
    duration: 3000,
    trail: "sh",
    weights: [1.7, 1],
    weightsBack: [1, 1.2],
    holds: [500, 0, 300],
    poses: [
      { ankle: [52, G], shin: 0, thigh: 0, trunk: 0, uarm: 205, farm: 340 },
      { ankle: [52, G], shin: 15, thigh: -42, trunk: 17, uarm: 208, farm: 336, neck: -8 },
      { ankle: [52, G], shin: 28, thigh: -80, trunk: 30, uarm: 212, farm: 332, neck: -14 },
    ],
  },

  rdl: {
    load: "bar",
    duration: 2800,
    trail: "hand",
    weights: [1.5, 1],
    weightsBack: [1, 1.3],
    holds: [450, 0, 250],
    poses: [
      { ankle: [52, G], shin: 0, thigh: 0, trunk: 0, uarm: 180, farm: 180 },
      { ankle: [52, G], shin: -3, thigh: -24, trunk: 27, uarm: 180, farm: 180, neck: -16 },
      { ankle: [52, G], shin: -5, thigh: -45, trunk: 50, uarm: 180, farm: 180, neck: -30 },
    ],
  },

  slrdl: {
    load: "db",
    duration: 3000,
    weights: [1.4],
    weightsBack: [1],
    holds: [400, 300],
    poses: [
      {
        ankle: [52, G],
        shin: 0,
        thigh: 0,
        trunk: 0,
        uarm: 180,
        farm: 180,
        thigh2: 188,
        shin2: 186,
      },
      {
        ankle: [52, G],
        shin: -4,
        thigh: -38,
        trunk: 62,
        uarm: 180,
        farm: 180,
        thigh2: 250,
        shin2: 258,
        neck: -38,
      },
    ],
  },

  bulgarian: {
    load: "db",
    duration: 3000,
    props: [{ type: "box", x: 12, y: 82, w: 30, h: 22, kind: "gear" }],
    weights: [1.6, 1],
    weightsBack: [1, 1.3],
    holds: [400, 0, 250],
    poses: [
      {
        ankle: [62, G],
        shin: 0,
        thigh: 0,
        trunk: 12,
        uarm: 180,
        farm: 180,
        thigh2: 228,
        shin2: 248,
        foot2: -20,
      },
      {
        ankle: [62, G],
        shin: 10,
        thigh: -30,
        trunk: 18,
        uarm: 180,
        farm: 180,
        thigh2: 212,
        shin2: 272,
        foot2: -20,
      },
      {
        ankle: [62, G],
        shin: 20,
        thigh: -58,
        trunk: 24,
        uarm: 180,
        farm: 180,
        thigh2: 195,
        shin2: 297,
        foot2: -20,
      },
    ],
  },

  stepup: {
    load: "db",
    duration: 3000,
    props: [{ type: "box", x: 58, y: 82, w: 34, h: 22, kind: "gear" }],
    // Ida = subir: explosiva y sin pausas largas. Vuelta = bajar: lenta, que es
    // donde trabaja el tejido de la rodilla.
    weights: [1, 1],
    weightsBack: [1.5, 1.5],
    holds: [350, 0, 250],
    poses: [
      // Pie de adelante arriba en el cajón, pie de atrás todavía en el suelo.
      {
        ankle: [66, 82],
        shin: 27,
        thigh: -84,
        trunk: 16,
        uarm: 180,
        farm: 180,
        thigh2: 180,
        shin2: 180,
      },
      {
        ankle: [66, 82],
        shin: 13,
        thigh: -42,
        trunk: 11,
        uarm: 180,
        farm: 180,
        thigh2: 190,
        shin2: 185,
      },
      // Arriba, de pie sobre el cajón, pierna libre suspendida.
      {
        ankle: [66, 82],
        shin: 0,
        thigh: 0,
        trunk: 6,
        uarm: 180,
        farm: 180,
        thigh2: 200,
        shin2: 190,
      },
    ],
  },

  // Salto al cajón como CICLO completo: sube, aterriza, se yergue, baja del
  // cajón y vuelve a la carga. La versión anterior terminaba de pie sobre el
  // cajón y reaparecía en el suelo (teletransporte); ahora el tramo de cierre
  // del ciclo también se anima.
  boxjump: {
    duration: 2800,
    loop: "cycle",
    props: [{ type: "box", x: 76, y: 82, w: 32, h: 22, kind: "gear" }],
    weights: [0.9, 0.9, 0.7, 0.8, 0.7, 0.7],
    ease: ["out", "in", "io", "io", "in", "io"],
    holds: [0, 0, 80, 350, 0, 120],
    poses: [
      // Carga: cuarto de sentadilla, brazos atrás para el contraimpulso.
      { ankle: [44, G], shin: 15, thigh: -40, trunk: 26, uarm: 205, farm: 235 },
      // Vuelo: cuerpo alto, brazos arriba, puntas estiradas.
      { ankle: [60, 74], shin: 8, thigh: -18, trunk: 10, uarm: 25, farm: 15, foot: 30 },
      // Aterrizaje sobre el cajón: absorber con cadera atrás.
      { ankle: [84, 82], shin: 16, thigh: -50, trunk: 30, uarm: 150, farm: 130 },
      // De pie sobre el cajón.
      { ankle: [84, 82], shin: 3, thigh: -4, trunk: 5, uarm: 180, farm: 180 },
      // Bajada del cajón: paso al aire.
      { ankle: [66, 80], shin: 8, thigh: -20, trunk: 12, uarm: 160, farm: 150, foot: 25 },
      // Aterrizaje en el suelo, ya casi en la pose de carga: el cierre del
      // ciclo no se nota.
      { ankle: [46, G], shin: 14, thigh: -42, trunk: 24, uarm: 195, farm: 225 },
    ],
  },

  pogo: {
    duration: 1100,
    loop: "cycle",
    weights: [1, 0.85, 0.85, 0.9],
    poses: [
      // Contacto: tobillo flexionado, rodilla casi recta. El rebote sale de aquí.
      { ankle: [52, G], shin: 5, thigh: -7, trunk: 6, uarm: 158, farm: 124, foot: -12 },
      // Impulso: el talón despega y la punta empieza a empujar.
      { ankle: [52, 96], shin: 3, thigh: -4, trunk: 4, uarm: 162, farm: 128, foot: 22 },
      // Vuelo: cuerpo alto y punta totalmente estirada. La amplitud está
      // exagerada a propósito — a tamaño de miniatura un salto real de 5 cm no
      // se distingue de estar quieto.
      { ankle: [52, 82], shin: 1, thigh: -1, trunk: 2, uarm: 168, farm: 134, foot: 48 },
      { ankle: [52, 96], shin: 3, thigh: -4, trunk: 4, uarm: 162, farm: 128, foot: 22 },
    ],
  },

  // El tempo de gemelos es el del estiramiento: subir, PAUSA arriba (ahí está
  // el estímulo del tendón), bajar más lento todavía.
  calfstanding: {
    duration: 1600,
    props: [{ type: "box", x: 58, y: 96, w: 34, h: 8, kind: "gear" }],
    weights: [1, 1],
    weightsBack: [1.5, 1.5],
    holds: [300, 0, 500],
    poses: [
      { toe: [64, 96], foot: -34, shin: 3, thigh: 0, trunk: 0, uarm: 180, farm: 180 },
      { toe: [64, 96], foot: 12, shin: 2, thigh: 0, trunk: 0, uarm: 180, farm: 180 },
      { toe: [64, 96], foot: 56, shin: 2, thigh: 0, trunk: 0, uarm: 180, farm: 180 },
    ],
  },

  calfsingle: {
    duration: 1600,
    props: [{ type: "box", x: 58, y: 96, w: 34, h: 8, kind: "gear" }],
    weights: [1, 1],
    weightsBack: [1.5, 1.5],
    holds: [300, 0, 500],
    poses: [
      {
        toe: [64, 96],
        foot: -34,
        shin: 3,
        thigh: 0,
        trunk: 0,
        uarm: 180,
        farm: 180,
        thigh2: 195,
        shin2: 250,
      },
      {
        toe: [64, 96],
        foot: 12,
        shin: 2,
        thigh: 0,
        trunk: 0,
        uarm: 180,
        farm: 180,
        thigh2: 195,
        shin2: 250,
      },
      {
        toe: [64, 96],
        foot: 56,
        shin: 2,
        thigh: 0,
        trunk: 0,
        uarm: 180,
        farm: 180,
        thigh2: 195,
        shin2: 250,
      },
    ],
  },

  /*
   * Misma mecánica que calfsingle —la punta fija en el escalón y el pie rotando—
   * pero con la rodilla doblada ~28°: la tibia se inclina adelante (shin 20) y el
   * muslo compensa hacia atrás (thigh -8) para que la cadera no se salga de la
   * base de apoyo. Esa flexión es el ejercicio entero: acorta el gemelo y deja el
   * trabajo en el sóleo. El ángulo se mantiene igual en los tres fotogramas,
   * porque enderezar la rodilla al subir es justo el error que hay que no enseñar.
   */
  calfsinglebent: {
    duration: 1600,
    props: [{ type: "box", x: 58, y: 96, w: 34, h: 8, kind: "gear" }],
    weights: [1, 1],
    weightsBack: [1.5, 1.5],
    holds: [300, 0, 500],
    poses: [
      {
        toe: [64, 96],
        foot: -34,
        shin: 22,
        thigh: -10,
        trunk: 4,
        uarm: 180,
        farm: 180,
        thigh2: 200,
        shin2: 252,
      },
      {
        toe: [64, 96],
        foot: 12,
        shin: 22,
        thigh: -10,
        trunk: 4,
        uarm: 180,
        farm: 180,
        thigh2: 200,
        shin2: 252,
      },
      {
        toe: [64, 96],
        foot: 56,
        shin: 22,
        thigh: -10,
        trunk: 4,
        uarm: 180,
        farm: 180,
        thigh2: 200,
        shin2: 252,
      },
    ],
  },

  legcurl: {
    mode: "raw",
    duration: 2400,
    ground: false,
    weights: [1.2, 1],
    weightsBack: [1.4, 1.4],
    holds: [250, 0, 350],
    props: [{ type: "box", x: 20, y: 74, w: 66, h: 8, kind: "gear" }],
    poses: [
      // Piernas extendidas, antebrazos apoyados delante del banco.
      {
        mode: "raw",
        joints: {
          head: [16, 60],
          sh: [34, 68],
          el: [26, 80],
          hand: [16, 86],
          hip: [70, 72],
          knee: [92, 73],
          ankle: [114, 74],
          heel: [113, 68],
          toe: [118, 82],
        },
      },
      {
        mode: "raw",
        joints: {
          head: [16, 60],
          sh: [34, 68],
          el: [26, 80],
          hand: [16, 86],
          hip: [70, 72],
          knee: [92, 73],
          ankle: [104, 54],
          heel: [99, 51],
          toe: [113, 60],
        },
      },
      // Talón al glúteo: rango completo, que es el punto del ejercicio.
      {
        mode: "raw",
        joints: {
          head: [16, 60],
          sh: [34, 68],
          el: [26, 80],
          hand: [16, 86],
          hip: [70, 72],
          knee: [92, 73],
          ankle: [86, 52],
          heel: [81, 51],
          toe: [95, 57],
        },
      },
    ],
  },

  deadbug: {
    mode: "raw",
    duration: 2800,
    groundY: 96,
    weights: [1.2, 1],
    weightsBack: [1, 1.2],
    holds: [350, 0, 400],
    poses: [
      // Punto de partida: brazo vertical y muslo a 90°, rodilla también a 90°.
      {
        mode: "raw",
        joints: {
          head: [24, 88],
          sh: [42, 92],
          el: [42, 76],
          hand: [42, 60],
          hip: [80, 94],
          knee: [80, 74],
          ankle: [96, 68],
          heel: [92, 64],
          toe: [103, 73],
        },
      },
      {
        mode: "raw",
        joints: {
          head: [24, 88],
          sh: [42, 92],
          el: [34, 78],
          hand: [24, 68],
          hip: [80, 94],
          knee: [88, 82],
          ankle: [104, 78],
          heel: [100, 74],
          toe: [111, 82],
        },
      },
      // Brazo y pierna contrarios extendidos, casi rozando el suelo.
      {
        mode: "raw",
        joints: {
          head: [24, 88],
          sh: [42, 92],
          el: [26, 84],
          hand: [10, 78],
          hip: [80, 94],
          knee: [100, 92],
          ankle: [120, 91],
          heel: [116, 87],
          toe: [125, 95],
        },
      },
    ],
  },

  sideplank: {
    mode: "raw",
    duration: 2400,
    groundY: 100,
    weights: [1.3],
    weightsBack: [1],
    holds: [300, 500],
    poses: [
      // Apoyo en antebrazo, cuerpo en línea, pierna de arriba abajo.
      {
        mode: "raw",
        joints: {
          head: [26, 58],
          sh: [38, 66],
          el: [30, 100],
          hand: [48, 100],
          hip: [72, 84],
          knee: [94, 93],
          ankle: [114, 100],
          heel: [110, 96],
          toe: [118, 104],
          knee2: [94, 93],
          ankle2: [114, 100],
          heel2: [110, 96],
          toe2: [118, 104],
        },
      },
      // Pierna de arriba en abducción, por detrás de la línea del cuerpo.
      {
        mode: "raw",
        joints: {
          head: [26, 58],
          sh: [38, 66],
          el: [30, 100],
          hand: [48, 100],
          hip: [72, 84],
          knee: [92, 74],
          ankle: [112, 66],
          heel: [108, 62],
          toe: [118, 70],
          knee2: [94, 93],
          ankle2: [114, 100],
          heel2: [110, 96],
          toe2: [118, 104],
        },
      },
    ],
  },

  pallof: {
    duration: 2400,
    props: [{ type: "line", x1: 14, y1: 18, x2: 14, y2: 104 }],
    band: { from: [14, 62], to: "hand" },
    weights: [1.2],
    weightsBack: [1],
    holds: [400, 400],
    poses: [
      { ankle: [58, G], shin: 0, thigh: 0, trunk: 0, uarm: 160, farm: 50 },
      { ankle: [58, G], shin: 0, thigh: 0, trunk: 0, uarm: 95, farm: 88 },
    ],
  },

  dbpress: {
    load: "db",
    duration: 2600,
    weights: [1, 1],
    weightsBack: [1.3, 1],
    holds: [300, 0, 250],
    poses: [
      { ankle: [52, G], shin: 0, thigh: 0, trunk: 0, uarm: 215, farm: 20 },
      { ankle: [52, G], shin: 0, thigh: 0, trunk: 0, uarm: 60, farm: 12 },
      { ankle: [52, G], shin: 0, thigh: 0, trunk: 0, uarm: 8, farm: 4 },
    ],
  },

  row: {
    load: "db",
    duration: 2400,
    weights: [1, 1.2],
    weightsBack: [1.2, 1],
    holds: [250, 0, 250],
    poses: [
      { ankle: [52, G], shin: -6, thigh: -34, trunk: 62, uarm: 180, farm: 180, neck: -38 },
      { ankle: [52, G], shin: -6, thigh: -34, trunk: 62, uarm: 202, farm: 166, neck: -38 },
      { ankle: [52, G], shin: -6, thigh: -34, trunk: 62, uarm: 222, farm: 152, neck: -38 },
    ],
  },

  // Ciclo de dos poses: abrir y cerrar el paso. Antes eran tres poses con la
  // tercera igual a la primera, y el tramo de cierre del ciclo no se animaba.
  monsterwalk: {
    duration: 2400,
    loop: "cycle",
    band: { from: "ankle", to: "ankle2", lift: 8 },
    weights: [1, 1],
    poses: [
      // El paso abre de verdad: con la separación anterior (7 unidades entre
      // tobillos) ni la abducción ni la banda estirada se leían.
      {
        ankle: [46, G],
        shin: 8,
        thigh: -16,
        trunk: 12,
        uarm: 190,
        farm: 200,
        thigh2: 198,
        shin2: 174,
      },
      {
        ankle: [46, G],
        shin: 8,
        thigh: -16,
        trunk: 12,
        uarm: 190,
        farm: 200,
        thigh2: 232,
        shin2: 208,
      },
    ],
  },

  tibialis: {
    duration: 2400,
    props: [{ type: "line", x1: 34, y1: 8, x2: 34, y2: 104 }],
    weights: [1, 1],
    weightsBack: [1.2, 1],
    holds: [250, 0, 300],
    poses: [
      { ankle: [52, G], foot: 14, shin: -4, thigh: -2, trunk: -4, uarm: 178, farm: 176 },
      { ankle: [52, G], foot: -18, shin: -4, thigh: -2, trunk: -4, uarm: 178, farm: 176 },
      { ankle: [52, G], foot: -52, shin: -4, thigh: -2, trunk: -4, uarm: 178, farm: 176 },
    ],
  },

  // Primer plano del arco: en la figura entera el movimiento sería invisible.
  // `ankle` hace de vértice del arco — al acortarlo, sube y los extremos se
  // acercan, que es exactamente lo que hace el pie.
  footdome: {
    mode: "raw",
    duration: 2600,
    groundY: 92,
    weights: [1.3],
    weightsBack: [1],
    holds: [300, 400],
    poses: [
      { mode: "raw", joints: { heel: [26, 90], ankle: [66, 82], toe: [112, 90] } },
      { mode: "raw", joints: { heel: [34, 90], ankle: [68, 66], toe: [106, 90] } },
    ],
  },
};

/*
 * Variantes de casa. Mismo gesto que la versión de gimnasio, sin carga externa:
 * se derivan en vez de copiarse para no duplicar veinte líneas de coordenadas
 * por ejercicio y para que un ajuste en la pose base llegue solo a las dos.
 *
 * El banco de la búlgara y el cajón de la subida siguen dibujados como aparato,
 * porque en casa siguen haciendo falta: son la silla y el escalón de la escalera.
 */
for (const [variante, base] of [
  ["bulgarianbw", "bulgarian"],
  ["slrdlbw", "slrdl"],
]) {
  POSES[variante] = { ...POSES[base], load: null };
}
