"""Chequeos deterministas sobre el plan de Runna y el feed que lo trae.

Las fechas son las del plan real hacia el medio maratón del 29-nov-2026: tirada
larga de 17 km el 8-nov y de 19 km el 15-nov, carrera el domingo 29. El feed de
aquí es sintético pero tiene la forma exacta del de Runna (UID con la semana y el
tipo, resumen con emoji, descripción con el enlace a la app al final).
"""
from __future__ import annotations

from datetime import date

import fetch_runna_plan
import runna_checks

RACE = date(2026, 11, 29)


def run(d: str, km: float, week: int = 7, kind: str = "LONG_RUN", name: str | None = None) -> dict:
    return {"date": d, "sport": "running", "week": week, "kind": kind,
            "name": name or f"{km:g}km Long Run", "distance_km": km, "description": ""}


# ── Semanas para la carrera ───────────────────────────────────────────────────


def test_el_martes_antes_de_una_carrera_en_domingo_es_semana_de_carrera():
    # El error que motivó contar hacia atrás: con semanas domingo→sábado el
    # martes 24 quedaba como "taper" y aceptaba ajustes a 5 días de la carrera.
    assert runna_checks.weeks_to_race(date(2026, 11, 24), RACE) == 0
    assert runna_checks.weeks_to_race(RACE, RACE) == 0
    assert runna_checks.phase_label(date(2026, 11, 19), RACE) == "TAPER"
    assert runna_checks.phase_label(date(2026, 10, 1), RACE) == "faltan 8 semanas"


def test_despues_de_la_carrera_no_hay_fase():
    assert runna_checks.weeks_to_race(date(2026, 11, 30), RACE) < 0
    assert runna_checks.phase_label(date(2026, 11, 30), RACE) is None


# ── Sesión pico ───────────────────────────────────────────────────────────────


def test_19_km_despues_de_17_es_pico():
    sessions = [run("2026-11-08", 17, week=6), run("2026-11-15", 19)]
    flags = runna_checks.spike_flags(sessions, base_km=15, race_date=RACE)
    # 17 sobre 15 también pasa del 10 %: la base arranca en la historia real.
    assert flags["2026-11-08"]["pct"] == 13
    assert flags["2026-11-15"] == {"km": 19, "base_km": 17, "pct": 12}


def test_subir_10_por_ciento_o_menos_no_es_pico():
    sessions = [run("2026-11-01", 16, week=5), run("2026-11-08", 17, week=6)]
    assert runna_checks.spike_flags(sessions, base_km=15, race_date=RACE) == {}


def test_la_carrera_no_se_marca_como_pico():
    sessions = [run("2026-11-22", 11, week=8), run("2026-11-29", 21, week=9, kind="RACE")]
    assert runna_checks.spike_flags(sessions, base_km=19, race_date=RACE) == {}


def test_sin_historia_no_se_inventan_picos():
    assert runna_checks.spike_flags([run("2026-11-15", 19)], base_km=None, race_date=RACE) == {}


def test_la_distancia_de_garmin_sale_del_nombre():
    garmin_session = {"date": "2026-09-13", "sport": "running",
                      "name": "W12 Sun Long Run - 19km Block Long Run (19km)"}
    assert runna_checks.planned_km(garmin_session) == 19


# ── Validación de ajustes ─────────────────────────────────────────────────────


def test_validacion_descarta_lo_que_no_se_puede_aplicar():
    sessions = [run("2026-11-12", 12.9, kind="TEMPO", name="Rolling 400s"), run("2026-11-15", 19)]
    raw = [
        {"date": "2026-11-12", "verdict": "ajustar", "change": "Series por FC, techo 172 bpm.", "rationale": "Altitud."},
        {"date": "2026-11-12", "verdict": "ajustar", "change": "Duplicado.", "rationale": ""},
        {"date": "2026-11-13", "verdict": "ajustar", "change": "Sin carrera ese día.", "rationale": ""},
        {"date": "2026-11-15", "verdict": "borrar", "change": "Veredicto inventado.", "rationale": ""},
        "no soy un dict",
    ]
    out = runna_checks.validate_adjustments(raw, sessions, RACE, flags={})
    assert [a["date"] for a in out] == ["2026-11-12"]
    assert out[0]["change"] == "Series por FC, techo 172 bpm."
    # El nombre lo pone el código, no el modelo.
    assert out[0]["runna_name"] == "Rolling 400s"
    assert out[0]["source"] == "modelo"


def test_el_pico_que_el_modelo_olvida_lo_completa_la_regla():
    sessions = [run("2026-11-15", 19)]
    flags = {"2026-11-15": {"km": 19, "base_km": 17, "pct": 12}}
    out = runna_checks.validate_adjustments([], sessions, RACE, flags)
    assert len(out) == 1
    assert out[0]["source"] == "regla"
    # 17 × 1,1 = 18,7 → se baja al medio kilómetro: 18,5.
    assert out[0]["change"].startswith("Correr 18,5 km en vez de 19 km")


def test_en_semana_de_carrera_no_hay_ajustes_ni_siquiera_por_regla():
    sessions = [run("2026-11-26", 8, week=9, kind="TAPER_INTERVALS")]
    raw = [{"date": "2026-11-26", "verdict": "cambiar_a_facil", "change": "Rodaje 6 km.", "rationale": ""}]
    flags = {"2026-11-26": {"km": 8, "base_km": 5, "pct": 60}}
    assert runna_checks.validate_adjustments(raw, sessions, RACE, flags) == []


def test_el_ajuste_queda_colgado_de_su_carrera_y_no_del_ciclismo():
    sessions = [
        {"date": "2026-11-15", "sport": "cycling", "name": "Ciclorruta en plano"},
        run("2026-11-15", 19),
    ]
    adjustments = runna_checks.validate_adjustments(
        [], sessions, RACE, {"2026-11-15": {"km": 19, "base_km": 17, "pct": 12}}
    )
    runna_checks.attach_adjustments(sessions, adjustments)
    assert "adjustment" not in sessions[0]
    assert sessions[1]["adjustment"]["verdict"] == "ajustar"


# ── Feed iCalendar ────────────────────────────────────────────────────────────

FEED = (
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Runna//EN\r\n"
    "BEGIN:VEVENT\r\n"
    "UID:UPCOMING_PLAN_WORKOUT-abc_plan_week_7_TEMPO_0\r\n"
    "DTSTART:20261112\r\n"
    "SUMMARY:🏃 Rolling 400s • 12.9km\r\n"
    "DESCRIPTION:Tempo • 12.9km • 1h10m\\n\\n4km warm up\\, easy\\nRepeat the fol\r\n"
    " lowing 8x\\n\\n📲 View in the Runna app: https://club.runna.com/x\r\n"
    "END:VEVENT\r\n"
    "BEGIN:VEVENT\r\n"
    "UID:UPCOMING_PLAN_WORKOUT-abc_plan_week_7_LEGS_AND_CORE_0\r\n"
    "DTSTART:20261111\r\n"
    "SUMMARY:🏋️ Lower Body Endurance Session • 55m - 65m\r\n"
    "DESCRIPTION:Legs And Core\r\n"
    "END:VEVENT\r\n"
    "BEGIN:VEVENT\r\n"
    "UID:UPCOMING_PLAN_WORKOUT-abc_plan_week_9_RACE_0\r\n"
    "DTSTART:20261129\r\n"
    "SUMMARY:🏃 21km Race • 21km\r\n"
    "DESCRIPTION:Race • 21km\\n\\n21km race at 5:20-5:35/km\r\n"
    "END:VEVENT\r\n"
    "BEGIN:VEVENT\r\n"
    "UID:COMPLETED_ACTIVITY-xyz\r\n"
    "DTSTART:20260920\r\n"
    "SUMMARY:🏃 Morning Run • 10km\r\n"
    "END:VEVENT\r\n"
    "END:VCALENDAR\r\n"
)


def test_el_feed_se_lee_completo_y_ordenado():
    sessions = fetch_runna_plan.parse_ics(FEED)
    assert [s["date"] for s in sessions] == ["2026-11-11", "2026-11-12", "2026-11-29"]
    tempo = sessions[1]
    assert tempo == {
        "date": "2026-11-12", "week": 7, "kind": "TEMPO", "sport": "running",
        "name": "Rolling 400s", "distance_km": 12.9,
        # Línea plegada unida, escapes resueltos y sin el enlace a la app.
        "description": "Tempo • 12.9km • 1h10m\n\n4km warm up, easy\nRepeat the following 8x",
    }


def test_la_fuerza_no_cuenta_como_carrera_y_lo_completado_se_ignora():
    sessions = fetch_runna_plan.parse_ics(FEED)
    assert sessions[0]["sport"] == "strength"
    assert sessions[0]["distance_km"] is None
    assert all(s["date"] != "2026-09-20" for s in sessions)


def test_la_fecha_de_carrera_sale_del_evento_race():
    assert fetch_runna_plan.race_date(fetch_runna_plan.parse_ics(FEED)) == "2026-11-29"
    assert fetch_runna_plan.race_date([]) is None


# ── Ciclismo como alternativa a un rodaje ────────────────────────────────────


def _cycling(d: str, kind: str = "subida_a_patios") -> dict:
    return {"date": d, "type": kind, "duration_min": 60, "rationale": ""}


def test_ciclismo_en_dia_de_rodaje_facil_queda_como_alternativa():
    sessions = [{"date": "2026-10-09", "sport": "running", "name": "8km Easy Run"}]
    kept, dropped = runna_checks.reconcile_cycling([_cycling("2026-10-09")], sessions)
    assert dropped == []
    assert kept[0]["alternative_to_easy_run"] is True
    assert kept[0]["alternative_to"] == "8km Easy Run"
    # La alternativa a un rodaje fácil no puede ser la subida en Z2.
    assert kept[0]["type"] == "ciclorruta_en_plano"
    # El rodaje sigue ahí: la función no toca las sesiones de Runna.
    assert sessions == [{"date": "2026-10-09", "sport": "running", "name": "8km Easy Run"}]


def test_ciclismo_en_dia_de_calidad_o_tirada_larga_se_descarta():
    sessions = [
        {"date": "2026-10-08", "sport": "running", "name": "1km Repeats"},
        {"date": "2026-10-11", "sport": "running", "name": "14km Long Run"},
    ]
    kept, dropped = runna_checks.reconcile_cycling(
        [_cycling("2026-10-08"), _cycling("2026-10-11")], sessions
    )
    assert kept == []
    assert dropped == ["2026-10-08", "2026-10-11"]


def test_ciclismo_en_dia_libre_no_es_alternativa():
    kept, _ = runna_checks.reconcile_cycling([_cycling("2026-10-10")], [])
    assert kept[0]["alternative_to_easy_run"] is False
    assert kept[0]["type"] == "subida_a_patios"
