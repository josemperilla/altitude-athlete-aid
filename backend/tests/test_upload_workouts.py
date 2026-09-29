"""El bloqueo duro de upload_workouts: nunca bici en un día con carrera de Runna,
salvo la alternativa a un rodaje fácil, que queda agendada junto al rodaje."""
from __future__ import annotations

import json

import upload_workouts

WORKOUT = {
    "workoutName": "Ciclorruta en plano",
    "sportType": {"sportTypeKey": "cycling"},
    "workoutSegments": [{"workoutSteps": [{"endConditionValue": 2700}]}],
}


def _upload(tmp_path, capsys, workout: dict) -> str:
    path = tmp_path / "2026-10-09_cycling.json"
    path.write_text(json.dumps(workout), encoding="utf-8")
    upload_workouts.upload_and_schedule(None, path, dry_run=True, running_dates={"2026-10-09"})
    return capsys.readouterr().out


def test_bici_normal_en_dia_de_carrera_se_salta(tmp_path, capsys):
    assert "SALTADO" in _upload(tmp_path, capsys, WORKOUT)


def test_alternativa_a_rodaje_se_agenda(tmp_path, capsys):
    out = _upload(tmp_path, capsys, {**WORKOUT, "alternative_to_easy_run": True})
    assert "SALTADO" not in out
    assert "Subiría" in out


def test_la_marca_interna_no_viaja_a_garmin():
    payload = upload_workouts.enrich_workout({**WORKOUT, "alternative_to_easy_run": True})
    assert "alternative_to_easy_run" not in payload
