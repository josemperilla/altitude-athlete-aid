/*
 * Ejercicios con fotografía real, de yuhonas/free-exercise-db (licencia
 * Unlicense, dominio público). Cada uno trae dos fotogramas — inicio y final del
 * movimiento — que la app alterna para que se vea el gesto.
 *
 * El valor es el nombre del ejercicio en ese dataset: queda anotado para poder
 * volver a descargarlo o revisarlo sin adivinar de dónde salió la imagen.
 * Los archivos viven en /ex/<clave>-0.jpg y /ex/<clave>-1.jpg.
 *
 * Lo que NO está aquí (pogos, elevación de talón a una pierna, tibial, arco del
 * pie, monster walk) se queda con la figura SVG animada de poses.js: el dataset
 * no los tiene, y una foto de otro ejercicio parecido enseñaría el gesto
 * equivocado.
 */
export const PHOTOS = {
  squat:        'Barbell_Squat',
  rdl:          'Romanian_Deadlift',
  slrdl:        'Kettlebell_One-Legged_Deadlift',
  bulgarian:    'Split_Squat_with_Dumbbells',
  stepup:       'Dumbbell_Step_Ups',
  boxjump:      'Front_Box_Jump',
  calfstanding: 'Rocking_Standing_Calf_Raise',
  calfseated:   'Seated_Calf_Raise',
  legcurl:      'Lying_Leg_Curls',
  sideplank:    'Side_Bridge',
  pallof:       'Pallof_Press',
  deadbug:      'Dead_Bug',
  dbpress:      'Dumbbell_Shoulder_Press',
  row:          'Bent_Over_Two-Dumbbell_Row',
};

// Dónde la foto no calza del todo con lo que pide el plan. Se muestra bajo la
// animación para que el atleta no copie el detalle equivocado.
export const PHOTO_CAVEATS = {
  slrdl: 'La foto usa kettlebell; tú lo haces con mancuerna en la mano contraria a la pierna de apoyo.',
  calfseated: 'La foto es en máquina de sóleo. Tú lo haces sentado en un banco, con el antepié en un disco y una mancuerna parada sobre cada rodilla.',
  calfstanding: 'La foto es con barra. Sirve igual la máquina o el escalón: lo que importa es el rango completo.',
  sideplank: 'La foto muestra la plancha lateral sin la abducción. Tú además subes la pierna de arriba.',
  bulgarian: 'En la foto el pie de atrás va en el suelo; el tuyo va elevado en un banco a la altura de la rodilla.',
};
