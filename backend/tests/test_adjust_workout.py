"""Ajustes que llegan al reloj: el workout de Runna con las ops aplicadas.

El workout de prueba tiene la forma exacta que Runna manda a Garmin (la del
tempo «On Off Ks» del 9-sep-2026): calentamiento y enfriamiento por distancia,
un bloque de repeticiones con ritmos en m/s y un descanso por tiempo.
"""
from __future__ import annotations

import copy
import json

import adjust_workout
import generate_plan
import runna_checks
import upload_workouts
from datetime import date


def _step(kind, cond, value, target="no.target", lo=None, hi=None, desc=""):
    return {
        "type": "ExecutableStepDTO", "stepId": 111, "stepType": {"stepTypeKey": kind},
        "endCondition": {"conditionTypeKey": cond}, "endConditionValue": value,
        "targetType": {"workoutTargetTypeKey": target}, "targetValueOne": lo, "targetValueTwo": hi,
        "description": desc,
    }


RUNNA_TEMPO = {
    "workoutId": 999, "workoutName": "W12 Wed Tempo - On Off Ks (10km)", "workoutProvider": "Runna",
    "workoutSegments": [{"segmentOrder": 1, "workoutSteps": [
        _step("warmup", "distance", 2000.0, desc="2km warm up"),
        {"type": "RepeatGroupDTO", "stepId": 222, "stepType": {"stepTypeKey": "repeat"},
         "endCondition": {"conditionTypeKey": "iterations"}, "endConditionValue": 3.0, "numberOfIterations": 3,
         "workoutSteps": [
             _step("interval", "distance", 1000.0, "pace.zone", 3.39, 3.17, "1km at 5:05/km"),
             _step("interval", "distance", 1000.0, "pace.zone", 3.92, 3.64, "1km at 4:25/km"),
         ]},
        _step("rest", "time", 90.0),
        _step("cooldown", "distance", 2000.0, desc="2km cool down"),
    ]}],
}
SESSION = {"date": "2026-10-08", "sport": "running", "name": "W12 Wed Tempo - On Off Ks (10km)",
           "garmin_workout": RUNNA_TEMPO}
ZONES = {"Z1": {"min": 0, "max": 125}, "Z2": {"min": 126, "max": 156}}


def _all(workout):
    return list(adjust_workout._walk(adjust_workout._steps(workout)))


def test_el_de_runna_no_se_toca_y_el_ajustado_es_un_workout_nuevo():
    original = copy.deepcopy(RUNNA_TEMPO)
    payload = adjust_workout.build(SESSION, {"change": "x", "ops": [{"op": "set_reps", "reps": 2}]}, ZONES)
    assert RUNNA_TEMPO == original
    assert payload["workoutName"] == "Ajustado · W12 Wed Tempo - On Off Ks (10km)"
    assert "workoutId" not in payload and "workoutProvider" not in payload
    assert all(st["stepId"] is None for st in _all(payload))
    assert payload["sportType"]["sportTypeKey"] == "running"


def test_set_distance_escala_lo_continuo_y_respeta_las_series():
    payload = adjust_workout.build(SESSION, {"ops": [{"op": "set_distance_km", "km": 9}]}, ZONES)
    steps = adjust_workout._steps(payload)
    # 10 km = 2 + 3×2 + 2. A 9 km, las series (6 km) quedan y los 4 km libres pasan a 3.
    assert steps[0]["endConditionValue"] == 1500 and steps[3]["endConditionValue"] == 1500
    assert steps[1]["numberOfIterations"] == 3


def test_hr_cap_cambia_ritmo_por_fc_menos_en_los_descansos():
    payload = adjust_workout.build(SESSION, {"ops": [{"op": "hr_cap", "bpm": 172}]}, ZONES)
    for st in _all(payload):
        key = (st.get("stepType") or {}).get("stepTypeKey")
        if key in ("repeat", "rest"):
            assert (st.get("targetType") or {}).get("workoutTargetTypeKey") != "heart.rate.zone"
        else:
            assert st["targetType"]["workoutTargetTypeKey"] == "heart.rate.zone"
            assert st["targetValueTwo"] == 172.0


def test_easy_run_reemplaza_todo_con_techo_de_z2():
    payload = adjust_workout.build(SESSION, {"change": "Rodaje", "ops": [{"op": "easy_run", "km": 8}]}, ZONES)
    [step] = adjust_workout._steps(payload)
    assert step["endConditionValue"] == 8000
    assert step["targetValueTwo"] == 156
    assert payload["estimatedDurationInSecs"] is None


def test_sin_ops_validas_no_se_sube_nada():
    assert adjust_workout.build(SESSION, {"ops": [{"op": "hr_cap", "bpm": 400}]}, ZONES) is None
    assert adjust_workout.build({"name": "sin detalle"}, {"ops": [{"op": "set_reps", "reps": 2}]}, ZONES) is None


def test_el_recorte_por_pico_llega_como_op_y_manda_sobre_la_distancia_del_modelo():
    sessions = [{"date": "2026-11-15", "sport": "running", "name": "19km Long Run"}]
    flags = {"2026-11-15": {"km": 19, "base_km": 17, "cap_km": 18.5, "pct": 12}}
    raw = [{"date": "2026-11-15", "verdict": "ajustar", "change": "Techo 160.",
            "ops": [{"op": "set_distance_km", "km": 19}, {"op": "hr_cap", "bpm": 160}]}]
    [adj] = runna_checks.validate_adjustments(raw, sessions, date(2026, 11, 29), flags)
    assert adj["ops"] == [{"op": "set_distance_km", "km": 18.5}, {"op": "hr_cap", "bpm": 160}]


def test_cambiar_a_facil_sin_op_arma_el_rodaje_con_los_km_de_la_sesion():
    sessions = [{"date": "2026-10-08", "sport": "running", "name": "1km Repeats", "distance_km": 10}]
    raw = [{"date": "2026-10-08", "verdict": "cambiar_a_facil", "change": "Rodaje fácil."}]
    [adj] = runna_checks.validate_adjustments(raw, sessions, date(2026, 11, 29), {})
    assert adj["ops"] == [{"op": "easy_run", "km": 10}]


def test_save_outputs_escribe_el_ajustado_y_marca_pushed(tmp_path, monkeypatch):
    workouts = tmp_path / "workouts"
    monkeypatch.setattr(generate_plan, "WORKOUTS_DIR", workouts)
    monkeypatch.setattr(generate_plan, "OUTPUT_PLAN", tmp_path / "augmented_plan.json")
    session = {**SESSION, "adjustment": {"verdict": "ajustar", "change": "2 series", "ops": [{"op": "set_reps", "reps": 2}]}}
    nota = {"date": "2026-10-09", "sport": "running", "name": "8km Easy Run",
            "adjustment": {"verdict": "ajustar", "change": "Nota sin ops", "ops": []}}
    plan = {"cycling_sessions": [], "runna_sessions": [session, nota]}

    generate_plan.save_outputs(plan, {"hr_zones": ZONES})

    written = json.loads((workouts / "2026-10-08_ajustado.json").read_text())
    assert written["payload_ready"] is True
    assert written["payload"]["workoutName"].startswith("Ajustado · ")
    saved = json.loads((tmp_path / "augmented_plan.json").read_text())
    assert saved["runna_sessions"][0]["adjustment"]["pushed"] is True
    assert saved["runna_sessions"][1]["adjustment"]["pushed"] is False
    assert not (workouts / "2026-10-09_ajustado.json").exists()


def test_el_ajustado_se_sube_tal_cual_aunque_ese_dia_haya_carrera(tmp_path, capsys):
    payload = adjust_workout.build(SESSION, {"ops": [{"op": "set_reps", "reps": 2}]}, ZONES)
    path = tmp_path / "2026-10-08_ajustado.json"
    path.write_text(json.dumps({"payload_ready": True, "payload": payload}))
    upload_workouts.upload_and_schedule(None, path, dry_run=True, running_dates={"2026-10-08"})
    out = capsys.readouterr().out
    assert "SALTADO" not in out
    assert "Ajustado · W12 Wed Tempo" in out


def test_solo_se_limpia_lo_nuestro():
    assert upload_workouts.is_ours("running", "Ajustado · 19km Long Run", None)
    assert upload_workouts.is_ours("cycling", "Ciclorruta en plano", None)
    assert not upload_workouts.is_ours("running", "19km Long Run", "Runna")
    assert not upload_workouts.is_ours("running", "Ajustado · x", "Runna")
    assert not upload_workouts.is_ours("running", "Mi carrera", None)
