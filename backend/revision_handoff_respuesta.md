# Respuesta a `handoff_revision_claude.md`

Verificado el 2-sep-2026 con búsqueda web. Convención: **[verificada]**, **[corregida]**,
**[no encontrada]**, **[matizada]**.

Resumen: de las 24 afirmaciones, **6 tenían errores de cita** (una de revista completa),
2 quedaron matizadas de forma que cambia la recomendación, y el resto se sostienen.
Los cambios al plan están en `tools/strength_plan.py`; los de la lista de compras, abajo.

---

## 1. Correcciones de cita

| # | Estado | Detalle |
|---|---|---|
| **S1** | **[corregida]** | Berryman et al. 2018 es *IJSPP* **13(1):57–63**, no 26–36. Título real: "Strength Training for Middle- and Long-Distance Performance: A Meta-Analysis". El tamaño de efecto sobre el coste energético de la locomoción es **0,65 (IC 90 % 0,32–0,98)**. Ojo: tiene una **fe de erratas** publicada (PMID 29517405); si vas a citar cifras finas, usa la versión corregida. |
| **S2** | **[corregida]** | Blagrove, Howatson & Hayes 2018 es *Sports Medicine* **48(5):1117–1149**, no 48(Suppl 1) S111–S130. La recomendación de ejercicios concretos es tu síntesis de sus tablas, no texto literal del artículo: preséntala como tal. |
| **S5** | **[corregida]** | Rønnestad & Mujika 2014 **no está en *Sports Medicine***. Es *Scandinavian Journal of Medicine & Science in Sports* **24(4):603–612**, "Optimizing strength training for running and cycling endurance performance: A review". Wilson et al. 2012 *JSCR* 26(8):2293–2307 sí está bien. |
| **S6** | **[corregida]** | Ramírez-Campillo et al. 2014, *JSCR* 28(1), existe — pero el desenlace de rendimiento fue una **carrera de 2,4 km**, no de 3 km. |
| **S7** | **[verificada, con matiz]** | Lauersen et al. 2014, *BJSM* **48(11):871–877**: correcto. Cifras reales: **26.610 participantes** y 3.464 lesiones. El subgrupo de sobreuso **sí está desglosado**: RR **0,527 (IC 95 % 0,373–0,746)**, o sea ~47 % menos, de 6 estudios. Tu "IRR ~0,3" corresponde a la reducción del entrenamiento de fuerza sobre lesiones en general ("a menos de un tercio"), no al subgrupo de sobreuso. El de 2018 (dosis-respuesta) es correcto. |
| **S16** | **[corregida]** | La posición ISSN de creatina (Kreider et al. 2017) es *JISSN* **14:18**, no 14:36. El 14:33 es la de *nutrient timing*. |
| **S17** | **[verificada]** | Morton et al. 2018, *BJSM* **52(6):376–384**. Punto de quiebre **1,62 g/kg/día**, 49 estudios, 1.863 participantes. Tu autocorrección de Phillips 2016 → Morton 2018 era la correcta. |
| **S18** | **[verificada]** | Shaw et al. 2017, *AJCN* **105(1):136–143**. Ver matices abajo. |
| **S22** | **[verificada]** | Posición ISSN de cafeína: Guest et al. 2021, *JISSN*. 3–6 mg/kg, típicamente 60 min antes. **Dato nuevo que te sirve:** para resistencia **en altitud** la posición respalda **4–6 mg/kg**, un rango algo más alto que a nivel del mar. |

---

## 2. Lo que no pudiste investigar

### S10 — Priming previo a la carrera → **la conclusión cambia**

La revisión es **Harrison et al. 2019, *Sports Medicine* 49:1499–1514**, "Resistance Priming
to Enhance Neuromuscular Performance in Sport". La ventana documentada es de **6 a 33 horas
antes**, con los picos a las **6 h y 24 h** y efectos residuales hasta 48 h. Protocolos:
series cortas (<6 reps) a carga alta (>85 % 1RM), o balístico a 30–40 %.

Dos consecuencias:

1. **Tu sesión del lunes 28 no es priming.** Está a 6 días de la carrera, muy fuera de la
   ventana. Es mantenimiento del patrón motor, y así la nombré en el plan. Llamarla priming
   te llevaría a esperar un efecto que no va a estar.
2. **Y no la muevas a la ventana real.** Toda esa literatura mide potencia y velocidad, no
   fondo. No hay evidencia de que un priming a 24 h mejore una media maratón, y el riesgo
   de llegar con fatiga residual es concreto. Tu instinto de "quizás mejor eliminarlo" era
   defendible; la salida es conservarlo pero degradado a mantenimiento ligero.

### S13 — Transferencia a media maratón → **confirmado, no hay RCT directo**

No encontré ningún ensayo con tiempo de media maratón como desenlace. La evidencia sigue
siendo economía de carrera y contrarrelojes de 3–10 km.

Lo que **sí** apareció y es lo más cercano a tu caso: un ECA reciente muestra que la fuerza
mejora la **durabilidad de la economía de carrera** y el rendimiento de alta intensidad **en
estado fatigado**, además de la economía en fresco. Ese es exactamente el mecanismo que
importa en una media maratón: no correr más rápido el km 1, sino que el km 18 cueste lo
mismo que el 4. Es el mejor argumento disponible y conviene que reemplace a la extrapolación
genérica.

### S18 — Seguimiento de Shaw 2017 → **más débil de lo que sugiere la ficha**

Los detalles importan: **n = 8 hombres**, diseño cruzado, **gelatina** (no colágeno
hidrolizado) enriquecida con vitamina C, **15 g una hora antes**, y 6 minutos de saltar
cuerda. El PINP se duplicó. El desenlace es **un biomarcador de síntesis**, no estructura de
tendón por imagen ni tasa de lesiones. Ocho sujetos.

Tu salvedad era correcta y me quedo con tu criterio: riesgo casi nulo, costo moderado,
justificable porque vas a meter carga nueva al tendón. Pero preséntalo como apuesta
mecanística, no como algo demostrado.

### S14 — Hierro y altitud → **el marco estaba mal aplicado**

Casi toda la literatura de hierro + altitud mide atletas que **suben** a altitud para un
campamento: en las 2–4 semanas de exposición hay un pico de eritropoyesis, y ahí el hierro
condiciona cuánta hemoglobina se produce (con 21 días de exposición, la masa de hemoglobina
subió 1,1 %, 3,3 % y 4,0 % con 0, 105 y 210 mg diarios de hierro oral).

**José vive en Bogotá.** No está en fase de adaptación aguda: está en estado estacionario.
Ese mecanismo no le aplica, y encuadrarlo como "la altitud aumenta la necesidad de hierro"
lo llevaría a suplementar por la razón equivocada.

Lo que sí aplica: los fondistas se quedan bajos de hierro con frecuencia, y para atletas de
resistencia el umbral útil de ferritina es **40–50 ng/mL**, más alto que el 10–20 de
laboratorio. Recomendación: **pedir ferritina, hemograma y saturación de transferrina, y
suplementar sólo si sale bajo.** A ciegas no: el exceso de hierro también hace daño y no
existe beneficio en alguien repleto. Y a 33 días de la carrera, corregir una ferritina baja
no alcanza a cambiar el resultado del 4 de octubre — es una jugada para el ciclo siguiente.

### S5 — Tu pregunta abierta sobre la separación

**Sí, ≥6 h es el número que aparece.** Se recomienda un intervalo de al menos 6 horas para
las adaptaciones neuromusculares y de resistencia cuando la carga de resistencia es intensa;
otro trabajo comparando 0 h, 6 h y 24 h encontró que la fuerza mejoró **menos** en el grupo
de 0 h que en los de 6 h y 24 h.

Sobre el orden: para maximizar fuerza y potencia conviene la fuerza primero o aislada. **En
tu caso el orden correcto es el inverso**, y no por fisiología sino por prioridad: la sesión
de calidad de Runna es la que determina tu tiempo del 4 de octubre, y el gimnasio es el
complemento. El que tiene que llegar fresco es el que corre. Se pierde algo de adaptación de
fuerza y está bien perderlo.

---

## 3. Cambios al plan

Tu lógica de ubicación (lunes pesado, miércoles tarde) **es correcta y la conservé**. Tres
cambios:

1. **La pliometría se pasa del miércoles al lunes.** Tu propio texto decía "al inicio y
   fresco", pero el miércoles la sesión va después de la calidad de Runna de la mañana: no
   hay tal frescura. Saltar con las piernas fatigadas es la peor combinación de calidad de
   ejecución y riesgo de lesión, y es justo lo que S12 quería evitar. El lunes sí llega
   fresco al gimnasio.
2. **Sesión del 28-sep renombrada a mantenimiento** y bajada a 25 min, por S10.
3. **Tren superior conservado** (no interfiere con las piernas) pero recortado a press +
   remo en superserie, para que la sesión quepa en 60 min con la pliometría movida.

Añadidos que no estaban en tu propuesta y que la evidencia respalda: **elevación de talón
sentado con rodilla a 90°** (el sóleo sólo se carga con la rodilla flexionada, y es el mayor
contribuyente a la propulsión), **tibial anterior y arco corto del pie**, y **trabajo
explícito de glúteo medio**.

Plan completo y con animaciones: <https://entrenador-gimnasio-production.up.railway.app>

---

## 4. Lista de compras — correcciones

Tu tabla tiene **dos errores de precio** que cambian la aritmética:

| Producto | Tu precio | Real | Nota |
|---|---|---|---|
| Creatina 300 g | $38.500 | **$76.450** | $38.500 es el envase de **100 g**. Por gramo: $385 (100 g) contra $255 (300 g). Sigue valiendo la pena, pero el total sube. |
| Whey | $76.890 | $76.890 (1 lb) | Correcto para 1 libra. **La de 5 lb a $318.890 sale a $192 por gramo de proteína** contra $216 (2 lb) y $230 (1 lb). |

**Cambios de fondo:**

- **Omega-3 fuera** (era tu prioridad 4). Las gomas dan **300 mg de DHA por porción**; los
  estudios de recuperación y respuesta inmune usan del orden de **2 g de EPA+DHA**. Está una
  potencia de diez por debajo. Tú mismo dijiste "puedes argumentar sacarla": la saco.
- **Magnesio: queda fuera de la compra**, no como opcional. Coincido con tu S20 y voy un paso
  más allá: la evidencia para sueño sin deficiencia es débil, y si igual lo quiere probar,
  las **gomas a $49.500 dan 300 mg** y el polvo a **$66.000 da 310 mg**. Pagar $16.500 más
  por 10 mg no tiene defensa.
- **Colágeno: sí, con el marco correcto** (ver S18). Y hay que decir la dosis: son **10 g por
  porción**, así que 15 g es porción y media, con vitamina C, una hora antes.

**Lista final:** creatina 300 g ($76.450) + whey 5 lb ($318.890) + colágeno ($49.500) =
**$444.840**. Si el whey de 5 lb es demasiado de una, el de 2 lb deja el total en $268.840 y
sigue por encima del umbral de envío gratis.

**Lo que no está en esa tienda y pesa más que todo lo anterior:** carbohidrato para durante
la carrera (60–90 g/h, ensayado en los fondos del 13 y el 20 de septiembre) y sodio. Sin
Intermediarios no vende geles, ni bebida deportiva, ni sales.

---

## 5. Sobre tus limitaciones declaradas

- **Peso corporal (punto 2):** sigue faltando. Todas las dosis por kg quedan sin calibrar:
  1,6–2,0 g/kg de proteína y 3–6 mg/kg de cafeína. Vale la pena preguntarlo.
- **W13–W15 proyectadas (punto 3):** confirmado, Runna sólo tiene sincronizado hasta el
  13-sep. Ahora el plan se regenera solo: `run_weekly.sh` corre `export_gym_plan.py` y
  republica la app, así que en cuanto Runna sincronice las semanas reales la página las
  muestra sin que nadie edite nada.
- **Tu sesgo declarado (punto 5):** me parece el correcto y no lo cambié. Con 33 días, el
  objetivo realista es economía y protección de tejido, no fuerza máxima. El plan no es
  demasiado conservador.
- **Un fallo del sistema que encontré de paso:** el prompt de `generate_plan.py` decía
  "martes y jueves son días de fuerza" y listaba el **lunes como día PREFERIDO para
  ciclismo**. Quedó obsoleto cuando el atleta se pasó a lunes y miércoles, así que el
  sistema estaba programando bici justo encima de la sesión pesada. Corregido, más un filtro
  en código por si el modelo se lo salta igual.
