"""La carrera es una sola (athletes.RACE); el feed de Runna solo se usa si es de
ese mismo ciclo."""
from __future__ import annotations

import generate_plan


def test_un_feed_de_otro_ciclo_se_ignora(capsys):
    viejo = {
        "race_date": "2026-10-04",
        "sessions": [{"date": "2026-09-27", "sport": "running", "week": 15, "kind": "LONG_RUN",
                      "name": "19km Long Run", "distance_km": 19, "description": ""}],
    }
    ctx = generate_plan.runna_context({"weekly_plan": []}, viejo)
    assert ctx["race_date"].isoformat() == "2026-11-29"
    assert ctx["macro"] == ""
    assert "se ignora el feed" in capsys.readouterr().err


def test_el_feed_del_ciclo_vigente_se_usa():
    vigente = {
        "race_date": "2026-11-29",
        "sessions": [{"date": "2026-11-29", "sport": "running", "week": 9, "kind": "RACE",
                      "name": "21km Race", "distance_km": 21, "description": "Race • 21km"}],
    }
    ctx = generate_plan.runna_context({"weekly_plan": []}, vigente)
    assert "W9" in ctx["macro"]


def test_los_workouts_de_una_corrida_anterior_se_borran(tmp_path, monkeypatch):
    workouts = tmp_path / "workouts"
    workouts.mkdir()
    # Una alternativa vieja: si sobreviviera, upload_workouts la subiría aunque
    # ese día Runna ahora tenga series.
    (workouts / "2026-10-08_cycling.json").write_text('{"alternative_to_easy_run": true}')
    monkeypatch.setattr(generate_plan, "WORKOUTS_DIR", workouts)
    monkeypatch.setattr(generate_plan, "OUTPUT_PLAN", tmp_path / "augmented_plan.json")

    generate_plan.save_outputs({"cycling_sessions": []}, {"hr_zones": {}})

    assert list(workouts.glob("*_cycling.json")) == []
