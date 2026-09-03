/*
 * Guía de cargas por ejercicio: cuánto peso cargar, cómo arrancar sin conocer
 * los 1RM, cómo progresar semana a semana y dónde parar.
 *
 * Ancla de todo el plan: RIR 2 — el peso con el que las últimas dos
 * repeticiones son duras pero completas. Los kg de arranque son el punto
 * típico para un corredor de ~70 kg con meses de gimnasio; el primer día
 * calibra y a partir de ahí manda la regla, no el número.
 */

export const PICK_RULES = [
  'Arranca con un peso donde las últimas 2 reps sean duras pero completas (RIR 2). Los kg son el punto de partida típico para un corredor de ~70 kg; ajústalos a tu sensación el primer día.',
  'Progresa cada semana: +2,5 kg en barra, siguiente mancuerna (~+2 kg) o +1 pin en máquina. Si no mantienes RIR 2 con buena técnica, vuelve al peso anterior.',
  'Este plan es neural, no de récords: respeta los techos y en semana de carrera baja a cargas ligeras de mantenimiento (60–65 % en sentadilla).',
];

export const WEIGHT_GUIDE = {
  squat: {
    inicio: 'Peso con el que las últimas 2 de 5 reps sean duras pero completas, sin fallar.',
    arranque: 'Arranca en 40–50 kg (barra + 10–15 kg por lado).',
    progresion: 'Sube 2,5 kg por semana (discos de 1,25): p. ej. 45 → 47,5 → 50 → 52,5 kg.',
    techo: 'Para este plan donde el RIR 2 se pierda, sin excepción.',
    aviso: 'Si la técnica se rompe, vuelve al peso anterior. Semana de carrera: 2×3 al 60–65 % (~30–35 kg).',
  },
  rdl: {
    inicio: 'Peso con el que las últimas 2 de 6 salgan duras con la espalda quieta y la cadera atrás.',
    arranque: 'Arranca en 40–50 kg (barra + 10–15 kg por lado).',
    progresion: 'Sube 2,5 kg por semana mientras la espalda no se redondee.',
    techo: 'Máximo ~60 kg en estas 4 semanas.',
    aviso: 'Si la lumbar se redondea o el peso te jala de las manos, baja al peso anterior.',
  },
  bulgarian: {
    inicio: 'Mancuernas con las que las últimas 2 reps por pierna sean duras pero limpias.',
    arranque: 'Arranca con 10–12 kg por mano.',
    progresion: 'Siguiente escalón por semana: 12 → 14 → 16 kg.',
    techo: 'Para en 18 kg por mano en este plan.',
    aviso: 'Si el torso baila o la rodilla se mete hacia adentro, baja un escalón.',
  },
  calfstanding: {
    inicio: 'Pin con el que las 8 reps duelan y la bajada de 3 s se sienta pesada.',
    arranque: 'Arranca en ~45 kg o el pin equivalente de tu máquina.',
    progresion: 'Sube 1 pin por semana.',
    techo: 'Máximo 4 pins arriba del arranque, siempre con bajada de 3 s.',
    aviso: 'Si rebotas o no llegas completo a la punta, vuelve al pin anterior. Semana de carrera: 2×8 con un pin menos.',
  },
  calfseated: {
    inicio: 'Peso con el que las últimas 2 de 15 cuesten pero suban completo.',
    arranque: 'Arranca con 10 kg en cada rodilla, una mancuerna por pierna.',
    progresion: 'Sube 2 kg por rodilla cada semana.',
    techo: '25 kg por rodilla. De ahí en adelante pásalo a una pierna a la vez.',
    aviso: 'Si el rango se acorta, el talón deja de bajar del disco o te ayudas con los brazos, quita 2 kg.',
  },
  pallof: {
    inicio: 'Banda con la que las últimas 2 reps por lado exijan sin girar la cadera.',
    arranque: 'Banda de resistencia media, de pie a un metro del anclaje.',
    progresion: 'Semana a semana aléjate del anclaje o pasa a banda más gruesa.',
    techo: 'Banda fuerte con 10 reps limpias por lado.',
    aviso: 'Si el torso rota o los hombros se suben, regresa a la banda anterior. Semana de carrera: 2×10 con banda ligera.',
  },
  monsterwalk: {
    inicio: 'Banda con la que los 15 pasos exijan sin que la rodilla se meta hacia adentro.',
    arranque: 'Banda media en los tobillos, en media sentadilla.',
    progresion: 'Pasa a banda más gruesa o alarga el paso.',
    techo: 'Banda fuerte manteniendo la cadera abajo y las rodillas afuera.',
    aviso: 'Si la banda te gana y pierdes la posición, vuelve a la banda anterior.',
  },
  slrdl: {
    inicio: 'Mancuerna con la que las últimas 2 reps exijan pero la cadera quede nivelada.',
    arranque: 'Arranca con 14–16 kg.',
    progresion: 'Siguiente escalón por semana: 16 → 18 → 20 kg.',
    techo: 'Para en 22 kg.',
    aviso: 'Si la cadera se abre o pierdes el equilibrio, baja un escalón.',
  },
  stepup: {
    inicio: 'Mancuernas con las que subas las 8 reps sin empujar con la pierna de abajo.',
    arranque: 'Arranca con 10 kg por mano.',
    progresion: 'Siguiente escalón por semana: 10 → 12 → 14 kg.',
    techo: 'Para en 16 kg por mano.',
    aviso: 'Si te impulsas con la pierna de abajo o el cajón se mueve, baja un escalón.',
  },
  legcurl: {
    inicio: 'Pin con el que las últimas 2 de 10 duelan pero completen el recorrido.',
    arranque: 'Arranca en ~35 kg de la máquina (ajusta a tu máquina).',
    progresion: 'Sube 1 pin por semana.',
    techo: 'Máximo 4 pins arriba del arranque.',
    aviso: 'Si la cadera se despega del apoyo, vuelve al pin anterior.',
  },
  sideplank: {
    inicio: 'Variante con la que los 20–30 s exijan sin caer la cadera.',
    arranque: 'Apoyo desde las rodillas, con abducción de pierna lenta.',
    progresion: 'Pasa a apoyo desde los pies con las piernas apiladas.',
    techo: '30 s por lado con abducción lenta y cuerpo en línea.',
    aviso: 'Si la cadera cae o la columna se arquea, vuelve a la variante de rodillas.',
  },
  calfsingle: {
    inicio: 'Variante con la que las últimas 2 de 12 por pierna cuesten con control.',
    arranque: 'Peso corporal en el escalón, una mano en la pared.',
    progresion: 'Quita el apoyo de la mano y luego suma mancuerna de 6–8 kg.',
    techo: '12 reps limpias por lado con mancuerna de 8 kg.',
    aviso: 'Si el tobillo se va hacia adentro o el rango se acorta, regresa a la variante anterior.',
  },
  dbpress: {
    inicio: 'Mancuernas con las que las últimas 2 de 8 sean duras sin arquear la espalda.',
    arranque: 'Arranca con 12–14 kg por mano.',
    progresion: 'Siguiente escalón por semana: 14 → 16 → 18 kg.',
    techo: 'Para en 20 kg por mano.',
    aviso: 'Si arqueas la lumbar o pierdes altura en el press, baja un escalón.',
  },
  row: {
    inicio: 'Mancuerna con la que las últimas 2 de 10 exijan con el torso quieto.',
    arranque: 'Arranca con 20–22 kg.',
    progresion: 'Siguiente escalón por semana: 22 → 24 → 26 kg.',
    techo: 'Para en 28–30 kg.',
    aviso: 'Si rotas el torso o jalas solo con el brazo, baja un escalón.',
  },
  tibialis: {
    inicio: 'Variante con la que las últimas reps de 15 exijan sin despegar el talón.',
    arranque: 'De pie contra la pared, peso corporal, pausa de 2 s arriba.',
    progresion: 'Sube la pausa a 3 s o pasa a máquina con placa de 5–10 kg.',
    techo: '15 reps en máquina con placa de 10 kg.',
    aviso: 'Si el talón se despega o te echas hacia atrás, vuelve a la pared.',
  },
  footdome: {
    inicio: 'Dominar el acortamiento del arco sin curl de dedos.',
    arranque: 'Short foot con sujeción de 3 s por rep.',
    progresion: 'Sube la sujeción a 5 s y luego hazlo sobre un solo pie.',
    techo: '15 reps por pie con 5 s de sujeción.',
    aviso: 'Si los dedos se agarrotan o el talón se desalinea, reduce el tiempo.',
  },
  deadbug: {
    inicio: 'Variante con la que la lumbar no se despegue del piso.',
    arranque: 'Brazos y rodillas a 90°, bajada lenta coordinada con la exhalación.',
    progresion: 'Baja más lento (3 s) o agrega una banda ligera en las manos.',
    techo: '10 reps por lado lentas con la lumbar pegada.',
    aviso: 'Si la lumbar se arquea, reduce el rango o mueve solo las piernas.',
  },
  pogo: {
    inicio: 'Rebotes cortos con contacto mínimo y tobillo firme.',
    arranque: '2×20 rebotes bajos sobre las puntas, rodillas casi rectas.',
    progresion: 'Haz el contacto más corto y rígido, luego pasa a 2×25.',
    techo: '2×25 rebotes elásticos con aterrizaje quieto.',
    aviso: 'Si el talón se hunde o pierdes el ritmo, baja las reps.',
  },
  boxjump: {
    inicio: 'Altura con la que aterrices suave y estable, no alto.',
    arranque: 'Cajón de 30 cm, 4 saltos con aterrizaje silencioso.',
    progresion: 'Sube a 35 y luego a 40 cm cuando el aterrizaje sea perfecto.',
    techo: 'Cajón de 40 cm.',
    aviso: 'Si el aterrizaje es duro o ruidoso, baja la altura. Nunca cargues peso aquí.',
  },
};
