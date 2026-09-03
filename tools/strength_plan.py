"""
Plan de fuerza en gimnasio — fuente única de verdad.

Por qué vive aquí y no en el frontend: `generate_plan.py` necesita saber qué días
hay gimnasio para no encimarle ciclismo (antes el prompt decía "martes y jueves son
días de fuerza", que quedó obsoleto cuando el atleta se pasó a lunes y miércoles, y
el lunes seguía siendo el día PREFERIDO para ciclismo — o sea, el sistema estaba
programando bici justo encima de la sesión pesada).

Consumidores:
  - tools/generate_plan.py    → inyecta GYM_DAYS en el prompt y agrega
                                strength_sessions al augmented_plan.json
  - tools/export_gym_plan.py  → exporta web/public/plan.json para la app de Railway

Bloque: 7-sep-2026 → 4-oct-2026 (medio maratón el domingo 4-oct).
Revisado contra handoff_revision_claude.md el 2-sep-2026; ver CHANGELOG abajo.

CHANGELOG vs. la propuesta del handoff
  - Pliometría movida de miércoles a lunes. El handoff la ponía "al inicio y fresco"
    el miércoles, pero el miércoles la sesión va DESPUÉS de la calidad de Runna de la
    mañana: no hay tal frescura. Saltar con las piernas ya fatigadas es la peor
    combinación de calidad de ejecución y riesgo.
  - La sesión del 28-sep NO es "priming". La ventana documentada de priming es 6–33 h
    antes (picos a las 6 h y 24 h), y la evidencia es en potencia/velocidad, no en
    fondo. A 6 días de la carrera es mantenimiento, y así se llama.
  - Tren superior conservado del handoff (no interfiere con las piernas), pero
    recortado a dos ejercicios en superserie para que la sesión quepa en 60 min.
"""
from __future__ import annotations

from datetime import date, timedelta

RACE_DATE = date(2026, 10, 4)

# Días de la semana con gimnasio. generate_plan.py lo usa para bloquear ciclismo.
GYM_WEEKDAYS = {0: "A", 2: "B"}  # 0 = lunes, 2 = miércoles


# ── Catálogo de ejercicios ────────────────────────────────────────────────────
# `anim` mapea al motor de animación de la web (web/public/app.js, POSES).
# `cues` = qué hacer bien. `errors` = el fallo que de verdad se comete.

EXERCISES = {
    "pogos": {
        "name": "Pogos",
        "target": "Rigidez del tobillo y tendón de Aquiles",
        "anim": "pogo",
        "cues": [
            "Rodilla casi recta: el salto sale del tobillo, no de la cadera.",
            "Contacto corto. Piensa en rebotar, no en aterrizar.",
            "Altura baja: 5–10 cm basta. Buscas rigidez, no salto vertical.",
        ],
        "errors": [
            "Doblar rodillas y convertirlo en sentadillas con salto.",
            "Aterrizar con el talón. El contacto es en la planta delantera.",
        ],
    },
    "box_jump": {
        "name": "Salto al cajón",
        "target": "Potencia de extensión de cadera",
        "anim": "boxjump",
        "cues": [
            "Cajón bajo (30–40 cm). No buscas altura, buscas velocidad de salida.",
            "Aterriza suave y con las rodillas flexionadas, sin ruido.",
            "Baja caminando del cajón, nunca saltando.",
        ],
        "errors": [
            "Cajón demasiado alto: te obliga a recoger las piernas en vez de extender la cadera.",
            "Encadenar repeticiones sin resetear. Cada salto empieza de cero.",
        ],
    },
    "squat": {
        "name": "Sentadilla trasera",
        "target": "Cuádriceps, glúteo mayor",
        "anim": "squat",
        "cues": [
            "La barra viaja en línea recta sobre el mediopié.",
            "Rodillas siguen la dirección de los pies; pueden pasar la punta.",
            "Baja hasta que la cadera quede por debajo de la rodilla, si tu movilidad lo permite.",
        ],
        "errors": [
            "Que la cadera suba antes que el pecho: se convierte en un buenos días con peso.",
            "Talones que se despegan. Si pasa, falta movilidad de tobillo: usa sentadilla goblet.",
        ],
        "alt": "Sin barra: goblet con mancuerna pesada, o prensa.",
    },
    "rdl": {
        "name": "Peso muerto rumano",
        "target": "Isquiotibiales, glúteo mayor",
        "anim": "rdl",
        "cues": [
            "Bisagra de cadera: la cadera va hacia atrás, no el torso hacia abajo.",
            "La barra roza el muslo todo el recorrido.",
            "Rodilla ligeramente flexionada y fija. No se mueve durante la serie.",
        ],
        "errors": [
            "Redondear la espalda baja. Paras la serie cuando pierdes la posición, no cuando falla la fuerza.",
            "Bajar más de la cuenta buscando rango. El rango lo define tu isquio, no el suelo.",
        ],
    },
    "bulgarian": {
        "name": "Zancada búlgara",
        "target": "Cuádriceps, glúteo, estabilidad de cadera",
        "anim": "bulgarian",
        "cues": [
            "Torso ligeramente adelante para cargar más glúteo.",
            "La rodilla de adelante estable, alineada con el pie.",
            "El pie de atrás solo equilibra; el 90 % del peso va en la pierna de adelante.",
        ],
        "errors": [
            "Rodilla que colapsa hacia adentro. Si pasa, baja el peso.",
            "Banco demasiado alto: te tuerce la pelvis. A la altura de la rodilla basta.",
        ],
    },
    "step_up": {
        "name": "Subida al cajón",
        "target": "Glúteo, cuádriceps, control unilateral",
        "anim": "stepup",
        "cues": [
            "Altura del cajón: la que deje la rodilla a 90°.",
            "Sube empujando con la pierna de arriba, sin impulsarte con la de abajo.",
            "Baja en 3 segundos. La bajada es la mitad valiosa del ejercicio.",
        ],
        "errors": [
            "Rebotar con el pie de abajo para arrancar.",
            "Dejarse caer en la bajada. Ahí se pierde todo el estímulo excéntrico.",
        ],
    },
    "calf_standing": {
        "name": "Elevación de talón de pie",
        "target": "Gemelos (rodilla extendida)",
        "anim": "calfstanding",
        "cues": [
            "Rodilla extendida: así trabaja el gemelo.",
            "Bajada de 3 segundos hasta estirar del todo, pausa abajo.",
            "Rango completo arriba: sube hasta que el talón no dé más.",
        ],
        "errors": [
            "Rebotar en el punto bajo usando el rebote elástico del tendón.",
            "Medio rango. El tendón se adapta al rango que le cargas.",
        ],
    },
    "calf_seated": {
        "name": "Elevación de talón sentado con mancuernas",
        "target": "Sóleo (rodilla flexionada)",
        "anim": "calfseated",
        "alt": "Si aparece máquina de sóleo, úsala: carga más y te ahorra sostener las mancuernas.",
        "cues": [
            "Sentado en el banco, antepié sobre un disco o escalón y rodilla a 90°: con la rodilla doblada el gemelo se acorta y el trabajo cae en el sóleo.",
            "Una mancuerna parada sobre cada rodilla, sujeta con la mano. Una toalla doblada debajo si el mango molesta.",
            "Este es el músculo que corre la media maratón. Mismo tempo: 3 segundos de bajada, pausa abajo con el talón por debajo del escalón.",
        ],
        "errors": [
            "Ponerle poco peso porque “es un accesorio”. El sóleo aguanta varias veces tu peso corporal en cada zancada.",
            "Apoyar el antepié en el suelo plano. Sin el disco pierdes la mitad de abajo del rango, que es la que importa.",
        ],
    },
    "bulgarian_home": {
        "name": "Zancada búlgara con silla",
        "target": "Cuádriceps, glúteo, estabilidad de cadera",
        "anim": "bulgarianbw",
        "alt": "Sin silla estable: zancada estática, el pie de atrás en el suelo.",
        "cues": [
            "El empeine del pie de atrás va sobre el asiento de una silla firme, contra la pared para que no se corra.",
            "Torso ligeramente adelante para cargar más glúteo; la rodilla de adelante alineada con el pie.",
            "Sin peso el estímulo lo pone el tempo: baja en 3 segundos y sube sin rebotar.",
        ],
        "errors": [
            "Silla con ruedas o demasiado alta. A la altura de la rodilla, y que no se mueva.",
            "Convertirlo en cardio por ir sin peso. Es fuerza: lento, controlado y cerca del fallo técnico.",
        ],
    },
    "sl_rdl_home": {
        "name": "Peso muerto rumano a una pierna sin peso",
        "target": "Isquios, glúteo medio, propiocepción",
        "anim": "slrdlbw",
        "alt": "Si te sobra equilibrio, sostén una garrafa de agua en la mano contraria.",
        "cues": [
            "La cadera se mantiene cerrada: el hueso de la cadera de arriba apunta al suelo, no al techo.",
            "La pierna libre se extiende atrás en línea con el torso; brazos colgando o cruzados al pecho.",
            "Sin carga el objetivo es el control: 3 segundos abajo y una pausa de 1 segundo antes de subir.",
        ],
        "errors": [
            "Abrir la cadera para llegar más abajo. Prefiere menos rango con la cadera cuadrada.",
            "Mirar al frente y arquear el cuello. La mirada va al suelo, un metro por delante.",
        ],
    },
    "calf_single": {
        "name": "Elevación de talón a una pierna",
        "target": "Tríceps sural unilateral",
        "anim": "calfsingle",
        "cues": [
            "Rango completo, subiendo hasta el tope.",
            "Apóyate en la pared solo para equilibrio, no para empujarte.",
            "Cuando pases de 15 repeticiones limpias, agrega mancuerna.",
        ],
        "errors": [
            "Compensar con la cadera dando un tirón hacia arriba.",
        ],
    },
    "sl_rdl": {
        "name": "Peso muerto rumano a una pierna",
        "target": "Isquios, glúteo medio, propiocepción",
        "anim": "slrdl",
        "cues": [
            "La cadera se mantiene cerrada: el hueso de la cadera de arriba apunta al suelo, no al techo.",
            "Mancuerna en la mano contraria a la pierna de apoyo.",
            "La pierna libre se extiende atrás en línea con el torso.",
        ],
        "errors": [
            "Abrir la cadera. Es el error universal de este ejercicio y anula el trabajo de glúteo medio.",
            "Ir tan rápido que el equilibrio decida el rango.",
        ],
    },
    "leg_curl": {
        "name": "Curl femoral",
        "target": "Isquiotibiales (flexión de rodilla)",
        "anim": "legcurl",
        "cues": [
            "Cadera pegada al banco durante todo el recorrido.",
            "Bajada controlada de 3 segundos.",
        ],
        "errors": [
            "Levantar la cadera para completar la repetición.",
        ],
        "alt": "Sin máquina: curl con fitball o deslizadores.",
    },
    "side_plank_abd": {
        "name": "Plancha lateral con abducción",
        "target": "Glúteo medio, oblicuos",
        "anim": "sideplank",
        "cues": [
            "Cuerpo en línea recta: tobillo, cadera y hombro alineados.",
            "La pierna de arriba sube por detrás de la línea del cuerpo, no por delante.",
            "Respira. Si aguantas la respiración, la serie es demasiado dura.",
        ],
        "errors": [
            "Dejar caer la cadera. Mejor 20 segundos buenos que 45 hundidos.",
            "Rotar el torso hacia el suelo.",
        ],
    },
    "pallof": {
        "name": "Press Pallof",
        "target": "Anti-rotación del tronco",
        "anim": "pallof",
        "cues": [
            "De pie, perpendicular a la polea o banda.",
            "Extiende los brazos sin dejar que el torso rote. Ahí está todo el ejercicio.",
            "Costillas abajo, glúteos activos.",
        ],
        "errors": [
            "Poner tanto peso que el torso gira. Si giras, no es anti-rotación.",
        ],
    },
    "dead_bug": {
        "name": "Dead bug",
        "target": "Anti-extensión del tronco",
        "anim": "deadbug",
        "cues": [
            "Zona lumbar pegada al suelo todo el tiempo.",
            "Extiende brazo y pierna contrarios, lento.",
            "Si la lumbar se despega, acortaste el rango: no bajes tanto la pierna.",
        ],
        "errors": [
            "Ir rápido. Es un ejercicio de control, no de repeticiones.",
        ],
    },
    "tibialis": {
        "name": "Elevación de punta (tibial anterior)",
        "target": "Tibial anterior",
        "anim": "tibialis",
        "cues": [
            "De espaldas a la pared, talones a 15 cm de ella.",
            "Sube las puntas lo más alto que puedas y baja lento.",
            "Es el seguro contra la periostitis tibial.",
        ],
        "errors": [
            "Rango corto. Debe arder en la espinilla.",
        ],
    },
    "foot_doming": {
        "name": "Arco corto del pie",
        "target": "Musculatura intrínseca del pie",
        "anim": "footdome",
        "cues": [
            "Descalzo, pie plano en el suelo.",
            "Acorta el arco acercando el metatarso al talón, sin doblar los dedos.",
            "Los dedos quedan relajados y en contacto con el suelo.",
        ],
        "errors": [
            "Doblar los dedos como garra. Eso es otro ejercicio y no fortalece el arco igual.",
        ],
    },
    "db_press": {
        "name": "Press de hombro con mancuernas",
        "target": "Deltoides, tríceps",
        "anim": "dbpress",
        "cues": [
            "Costillas abajo, sin arquear la espalda baja.",
            "Sube hasta extender del todo, sin bloquear con tirón.",
        ],
        "errors": [
            "Convertirlo en press inclinado arqueando la lumbar.",
        ],
    },
    "row": {
        "name": "Remo con barra o mancuerna",
        "target": "Dorsal, romboides, postura",
        "anim": "row",
        "cues": [
            "Torso casi paralelo al suelo, espalda neutra.",
            "Lleva el codo hacia atrás, no hacia arriba.",
        ],
        "errors": [
            "Usar impulso de cadera para subir el peso.",
        ],
    },
    "monster_walk": {
        "name": "Monster walk con banda",
        "target": "Glúteo medio (activación)",
        "anim": "monsterwalk",
        "cues": [
            "Banda por encima de las rodillas o en los tobillos.",
            "Semiflexión de rodillas, pasos laterales sin juntar los pies.",
            "Mantén la tensión de la banda todo el recorrido.",
        ],
        "errors": [
            "Balancear el torso de lado a lado. El movimiento es solo de piernas.",
        ],
    },
}


# ── Sesiones ──────────────────────────────────────────────────────────────────

SESSION_A = {
    "code": "A",
    "title": "Fuerza pesada",
    "weekday": "Lunes",
    "duration_min": 58,
    "summary": (
        "Poco volumen, carga alta, descansos largos. Terminas cansado del sistema "
        "nervioso, no de los músculos: eso es lo que te deja correr bien al día "
        "siguiente. Si acabas con temblor o bombeo, te pasaste de repeticiones."
    ),
    "blocks": [
        {
            "name": "Activación",
            "minutes": 10,
            "items": [
                {"ex": None, "label": "Bici o remo suave", "prescription": "5 min", "load": "Z1"},
                {"ex": None, "label": "Movilidad de tobillo a la pared + 90/90 de cadera",
                 "prescription": "1 × 10 / lado", "load": "—"},
                {"ex": "pogos", "prescription": "2 × 20", "load": "Peso corporal · 45 s"},
            ],
        },
        {
            "name": "Pliometría",
            "minutes": 6,
            "note": "Va aquí, en fresco y antes de cargar. Volumen bajo a propósito: "
                    "no hay historial pliométrico y faltan pocas semanas.",
            "items": [
                {"ex": "box_jump", "prescription": "3 × 4", "load": "Cajón 30–40 cm · 90 s"},
            ],
        },
        {
            "name": "Fuerza principal",
            "minutes": 32,
            "items": [
                {"ex": "squat", "prescription": "4 × 5", "load": "RPE 7–8 · 2 en reserva · 3 min"},
                {"ex": "rdl", "prescription": "3 × 6", "load": "RPE 7 · 2 min"},
                {"ex": "bulgarian", "prescription": "3 × 6 / pierna", "load": "RPE 7 · 90 s"},
            ],
        },
        {
            "name": "Tríceps sural",
            "minutes": 6,
            "items": [
                {"ex": "calf_standing", "prescription": "3 × 8", "load": "Pesado · 3 s de bajada · 90 s"},
                {"ex": "calf_seated", "prescription": "3 × 15", "load": "Pesado · 3 s de bajada · 60 s"},
            ],
        },
        {
            "name": "Tronco",
            "minutes": 4,
            "items": [
                {"ex": "pallof", "prescription": "3 × 10 / lado", "load": "45 s"},
            ],
        },
    ],
}

SESSION_B = {
    "code": "B",
    "title": "Unilateral, estabilidad y tren superior",
    "weekday": "Miércoles",
    "duration_min": 55,
    "summary": (
        "Va después de la sesión de calidad de Runna, con al menos 6 horas de "
        "separación. Cargas moderadas y control: aquí no buscas récords, buscas que "
        "la pelvis no se caiga en el kilómetro 18."
    ),
    "blocks": [
        {
            "name": "Activación",
            "minutes": 6,
            "items": [
                {"ex": None, "label": "Caminata en banda", "prescription": "4 min", "load": "—"},
                {"ex": "monster_walk", "prescription": "2 × 15 pasos", "load": "Banda · 30 s"},
            ],
        },
        {
            "name": "Unilateral",
            "minutes": 20,
            "items": [
                {"ex": "sl_rdl", "prescription": "3 × 8 / lado", "load": "RPE 6–7 · 90 s"},
                {"ex": "step_up", "prescription": "3 × 8 / pierna", "load": "Mancuernas · 90 s"},
                {"ex": "leg_curl", "prescription": "3 × 10", "load": "RPE 7 · 90 s"},
            ],
        },
        {
            "name": "Cadera y pantorrilla",
            "minutes": 10,
            "items": [
                {"ex": "side_plank_abd", "prescription": "3 × 20–30 s / lado", "load": "45 s"},
                {"ex": "calf_single", "prescription": "3 × 12 / lado", "load": "60 s"},
            ],
        },
        {
            "name": "Tren superior",
            "minutes": 9,
            "note": "En superserie. No interfiere con las piernas y sostiene la postura "
                    "en la segunda mitad de la carrera.",
            "items": [
                {"ex": "db_press", "prescription": "3 × 8", "load": "RPE 7 · superserie"},
                {"ex": "row", "prescription": "3 × 10", "load": "RPE 7 · 90 s"},
            ],
        },
        {
            "name": "Pie y tronco",
            "minutes": 10,
            "items": [
                {"ex": "tibialis", "prescription": "2 × 15", "load": "45 s"},
                {"ex": "foot_doming", "prescription": "2 × 15 / pie", "load": "30 s"},
                {"ex": "dead_bug", "prescription": "3 × 10 / lado", "load": "45 s"},
            ],
        },
    ],
}

SESSION_TAPER = {
    "code": "M",
    "title": "Mantenimiento",
    "weekday": "Lunes",
    "duration_min": 25,
    "summary": (
        "Corta y fácil. No es una sesión de “priming”: la ventana documentada de "
        "priming es de 6 a 33 horas antes y la evidencia es en potencia y velocidad, "
        "no en fondo. A seis días de la carrera esto solo mantiene el patrón motor. "
        "Sales con más energía de la que entraste."
    ),
    "blocks": [
        {
            "name": "Sesión completa",
            "minutes": 25,
            "items": [
                {"ex": "pogos", "prescription": "2 × 15", "load": "Peso corporal"},
                {"ex": "squat", "prescription": "2 × 3", "load": "60–65 % · lejos del fallo"},
                {"ex": "calf_standing", "prescription": "2 × 8", "load": "Moderado"},
                {"ex": "pallof", "prescription": "2 × 10 / lado", "load": "Ligero"},
            ],
        },
    ],
}


# ── Calendario del bloque ─────────────────────────────────────────────────────

WEEKS = [
    {
        "runna_week": "W12",
        "start": date(2026, 9, 7),
        "phase": "Introducción",
        "intent": (
            "Deliberadamente floja. El error clásico es entrar con todo el lunes 7 y "
            "llegar al tempo del miércoles con las piernas destruidas: eso arruina la "
            "sesión que sí determina tu tiempo."
        ),
        "loading": "RPE 6–7, con 3–4 repeticiones en reserva. Elige pesos con los que "
                   "podrías hacer 4 más. Pliometría: ~30 contactos.",
        "sessions": [
            {"date": date(2026, 9, 7), "session": "A", "scale": 1.0},
            {"date": date(2026, 9, 9), "session": "B", "scale": 1.0},
        ],
    },
    {
        "runna_week": "W13",
        "start": date(2026, 9, 14),
        "phase": "Carga",
        "intent": "La semana con más estímulo real de todo el bloque.",
        "loading": "Sube 5–10 % en sentadilla y peso muerto rumano. RPE 7–8, 2 "
                   "repeticiones en reserva. Pliometría: ~45 contactos.",
        "sessions": [
            {"date": date(2026, 9, 14), "session": "A", "scale": 1.0},
            {"date": date(2026, 9, 16), "session": "B", "scale": 1.0},
        ],
    },
    {
        "runna_week": "W14",
        "start": date(2026, 9, 21),
        "phase": "Pico",
        "intent": "Última semana con carga pesada. El lunes 21 es tu última sesión "
                  "fuerte del ciclo: quedan 13 días hasta la carrera.",
        "loading": "Lunes: sentadilla a 4 × 4, RPE 8. Miércoles: mismos ejercicios, "
                   "2 series en vez de 3. Pliometría: ~30 contactos.",
        "sessions": [
            {"date": date(2026, 9, 21), "session": "A", "scale": 1.0, "note": "Sentadilla 4 × 4 a RPE 8. Última pesada."},
            {"date": date(2026, 9, 23), "session": "B", "scale": 0.66, "note": "2 series por ejercicio en vez de 3."},
        ],
    },
    {
        "runna_week": "W15",
        "start": date(2026, 9, 28),
        "phase": "Afinamiento",
        "intent": "Cero carga pesada. La fuerza ganada se conserva sin entrenar durante "
                  "semanas; la frescura no.",
        "loading": "Solo lunes, 25 minutos. Miércoles 30: nada, o 15 minutos de movilidad.",
        "sessions": [
            {"date": date(2026, 9, 28), "session": "M", "scale": 1.0},
        ],
    },
]

# Sesiones de casa. No están en WEEKS a propósito: son opcionales y no cuentan
# como sesiones del bloque, así que no mueven la barra de progreso ni el contador
# de sesiones restantes. Se hacen el día que amaneces con energía de sobra, no
# por calendario. Cero máquinas y cero pesas: solo una silla, una pared y el suelo.

SESSION_HOME_STRENGTH = {
    "code": "C1",
    "label": "Casa · fuerza",
    "title": "Fuerza en casa, sin nada",
    "weekday": "El día que amanezcas con energía",
    "duration_min": 22,
    "summary": (
        "Extra, no reemplazo. Si el HRV está bien y el cuerpo pide, esto suma "
        "trabajo unilateral sin tocar el sistema nervioso como la Sesión A. Sin "
        "carga el estímulo lo pone el tempo, así que la regla es lenta y limpia: "
        "el día que la hagas rápido, no hiciste fuerza, hiciste cardio. Cuenta "
        "como sesión de piernas: las 36 horas antes del fondo del domingo siguen "
        "estando prohibidas."
    ),
    "blocks": [
        {
            "name": "Activación",
            "minutes": 3,
            "note": "Descalzo si puedes.",
            "items": [
                {"ex": "foot_doming", "prescription": "1 × 10 / pie", "load": "Peso corporal"},
                {"ex": "pogos", "prescription": "2 × 15", "load": "Peso corporal · 45 s"},
            ],
        },
        {
            "name": "Fuerza unilateral",
            "minutes": 12,
            "note": "El asiento de la silla contra la pared, para que no se corra.",
            "items": [
                {"ex": "bulgarian_home", "prescription": "3 × 10 / pierna", "load": "3 s de bajada · 60 s"},
                {"ex": "sl_rdl_home", "prescription": "3 × 8 / pierna", "load": "3 s de bajada · pausa de 1 s · 60 s"},
            ],
        },
        {
            "name": "Tríceps sural",
            "minutes": 4,
            "items": [
                {"ex": "calf_single", "prescription": "3 × 15 / pierna", "load": "Peso corporal · 45 s"},
            ],
        },
        {
            "name": "Tronco",
            "minutes": 3,
            "items": [
                {"ex": "dead_bug", "prescription": "2 × 8 / lado", "load": "Lento"},
            ],
        },
    ],
}

SESSION_HOME_SPRING = {
    "code": "C2",
    "label": "Casa · elasticidad",
    "title": "Elasticidad y pie, en casa",
    "weekday": "El día que amanezcas con energía",
    "duration_min": 16,
    "summary": (
        "La más corta y la más barata de recuperar: trabaja tobillo, pie y cadera "
        "sin cargar la musculatura grande. Es la que puedes hacer aunque mañana "
        "toque calidad, porque casi no deja fatiga. Si acabas con los gemelos "
        "hinchados, te pasaste de saltos."
    ),
    "blocks": [
        {
            "name": "Pie",
            "minutes": 4,
            "note": "Descalzo, sobre suelo duro.",
            "items": [
                {"ex": "foot_doming", "prescription": "2 × 10 / pie", "load": "Peso corporal"},
                {"ex": "tibialis", "prescription": "2 × 15", "load": "De espaldas a la pared"},
            ],
        },
        {
            "name": "Rigidez del tobillo",
            "minutes": 6,
            "note": "Contacto corto: si suena fuerte al caer, estás aterrizando en vez de rebotar.",
            "items": [
                {"ex": "pogos", "prescription": "3 × 20", "load": "Peso corporal · 60 s"},
                {"ex": "calf_single", "prescription": "2 × 12 / pierna", "load": "Peso corporal · 45 s"},
            ],
        },
        {
            "name": "Cadera y tronco",
            "minutes": 6,
            "items": [
                {"ex": "side_plank_abd", "prescription": "2 × 8 / lado", "load": "Sin aguantar la respiración"},
                {"ex": "dead_bug", "prescription": "2 × 10 / lado", "load": "Lento"},
            ],
        },
    ],
}


SESSIONS = {
    "A": SESSION_A,
    "B": SESSION_B,
    "M": SESSION_TAPER,
    "C1": SESSION_HOME_STRENGTH,
    "C2": SESSION_HOME_SPRING,
}


RULES = [
    ("El miércoles se corre primero.",
     "La sesión de Runna es la prioridad. Gimnasio después, con 6 horas de separación "
     "si puedes. La literatura de entrenamiento concurrente sugiere ≥6 h para minimizar "
     "la interferencia aguda. Si solo tienes un hueco, corres."),
    ("Ninguna sesión de piernas dentro de las 36 horas previas al fondo del domingo.",
     "Ni sábado, ni domingo temprano."),
    ("Si el HRV amanece por debajo de 35 ms o el sueño por debajo de 50, cambias la Sesión A por la B.",
     "O cortas las series a la mitad. El 2 de septiembre amaneciste en 34 de HRV y 52 de "
     "sueño: ese día el gimnasio resta."),
    ("Agujetas de 48 horas o más significan que te pasaste de volumen, no de peso.",
     "Quita una serie, no kilos."),
    ("Nada nuevo después del 21 de septiembre.",
     "Ningún ejercicio, suplemento, zapatilla ni desayuno que no hayas probado ya."),
    ("Dolor agudo, punzante o en un punto exacto detiene la serie.",
     "Molestia difusa y simétrica es carga. Dolor localizado en tendón de Aquiles, "
     "rótula o tibia es señal."),
    ("A 2.600 metros recuperas más lento.",
     "Los descansos largos entre series no son pereza, son parte de la prescripción."),
]


# ── API para los consumidores ─────────────────────────────────────────────────

def gym_dates() -> dict[str, str]:
    """{'2026-09-07': 'A', ...} — todas las fechas con gimnasio del bloque."""
    out = {}
    for week in WEEKS:
        for s in week["sessions"]:
            out[s["date"].isoformat()] = s["session"]
    return out


def gym_dates_between(start: date, end: date) -> dict[str, str]:
    return {d: c for d, c in gym_dates().items() if start.isoformat() <= d <= end.isoformat()}


def _serialize_item(item: dict) -> dict:
    ex_id = item.get("ex")
    out = {
        "prescription": item.get("prescription", ""),
        "load": item.get("load", ""),
    }
    if ex_id:
        ex = EXERCISES[ex_id]
        out.update({
            "id": ex_id,
            "name": ex["name"],
            "target": ex["target"],
            "anim": ex["anim"],
            "cues": ex["cues"],
            "errors": ex["errors"],
        })
        if ex.get("alt"):
            out["alt"] = ex["alt"]
    else:
        out.update({"id": None, "name": item.get("label", ""), "target": "", "anim": None,
                    "cues": [], "errors": []})
    return out


def _serialize_session(code: str) -> dict:
    s = SESSIONS[code]
    return {
        "code": s["code"],
        "label": s.get("label"),
        "title": s["title"],
        "weekday": s["weekday"],
        "duration_min": s["duration_min"],
        "summary": s["summary"],
        "blocks": [
            {
                "name": b["name"],
                "minutes": b["minutes"],
                "note": b.get("note"),
                "items": [_serialize_item(i) for i in b["items"]],
            }
            for b in s["blocks"]
        ],
    }


def as_dict() -> dict:
    """Plan completo serializable — lo consume export_gym_plan.py y la app web."""
    return {
        "race_date": RACE_DATE.isoformat(),
        "sessions": {code: _serialize_session(code) for code in SESSIONS},
        "weeks": [
            {
                "runna_week": w["runna_week"],
                "start": w["start"].isoformat(),
                "end": (w["start"] + timedelta(days=6)).isoformat(),
                "phase": w["phase"],
                "intent": w["intent"],
                "loading": w["loading"],
                "sessions": [
                    {
                        "date": s["date"].isoformat(),
                        "session": s["session"],
                        "scale": s.get("scale", 1.0),
                        "note": s.get("note"),
                    }
                    for s in w["sessions"]
                ],
            }
            for w in WEEKS
        ],
        "rules": [{"rule": r, "detail": d} for r, d in RULES],
    }


def prompt_block() -> str:
    """Bloque de texto que generate_plan.py inyecta en el system prompt."""
    lines = []
    for week in WEEKS:
        for s in week["sessions"]:
            sess = SESSIONS[s["session"]]
            lines.append(
                f"  {s['date'].isoformat()} | {sess['weekday']:<9} | Gimnasio {sess['code']} "
                f"— {sess['title']} (~{sess['duration_min']} min)"
            )
    return "\n".join(lines)


if __name__ == "__main__":
    import json
    print(json.dumps(as_dict(), indent=2, ensure_ascii=False))
