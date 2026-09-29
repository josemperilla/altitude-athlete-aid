"""El tablero de rendimiento: agrupación de zonas, semanas vacías, lecturas."""
from __future__ import annotations

from datetime import date

import performance

HOY = date(2026, 9, 29)  # martes


def garmin(d, km, minutes, hr, zones, name="Morning Run", elev=2550, cadence=158):
    """Un resumen de Garmin con la forma real de get_activities."""
    return {
        "activityType": {"typeKey": "running"}, "startTimeLocal": f"{d} 07:00:00", "activityName": name,
        "distance": km * 1000, "duration": minutes * 60, "averageHR": hr, "maxHR": hr + 20,
        **{f"hrTimeInZone_{i + 1}": z * 60 for i, z in enumerate(zones)},
        "vO2MaxValue": 48.0, "averageRunningCadenceInStepsPerMinute": cadence, "minElevation": elev,
    }


def test_compact_descarta_lo_que_no_es_carrera():
    assert performance.compact({"activityType": {"typeKey": "cycling"}, "distance": 20000}) is None
    run = performance.compact(garmin("2026-09-20", 10, 60, 145, [5, 10, 40, 5, 0]))
    assert run["km"] == 10 and run["zones_sec"] == [300, 600, 2400, 300, 0]


def test_bajo_es_z1_a_z3_de_garmin():
    # 145 lpm cae en la Z3 del reloj (137–155), pero es rodaje fácil para la app.
    runs = [performance.compact(garmin("2026-09-20", 10, 60, 145, [0, 10, 40, 10, 0]))]
    perf = performance.build(runs, HOY)
    assert perf["kpis"]["zones_pct_12w"] == {"low": 83, "mid": 17, "high": 0}


def test_las_semanas_sin_carreras_cuentan():
    runs = [performance.compact(garmin("2026-09-22", 8, 50, 145, [0, 0, 50, 0, 0]))]
    perf = performance.build(runs, HOY, weeks=4)
    # Lunes a domingo: el 22 cae en la semana del 21; la del 28 (en curso) va vacía.
    assert [w["week"] for w in perf["weekly"]] == ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]
    assert [w["km"] for w in perf["weekly"]] == [0, 0, 8, 0]


def test_poco_tiempo_suave_pide_techo_de_fc():
    runs = [performance.compact(garmin("2026-09-2%d" % i, 10, 60, 165, [0, 5, 15, 30, 10], name="Easy Run"))
            for i in range(1, 5)]
    perf = performance.build(runs, HOY)
    [primera, *_] = perf["insights"]
    assert primera["level"] == "act"
    assert "suave" in primera["title"]
    # Los "Easy Run" a 165 de media no fueron fáciles.
    assert perf["kpis"]["easy_runs_in_zone"] == 0
    assert "[ACT]" in performance.prompt_block(perf)


def test_la_eficiencia_solo_compara_bogota_y_pulso_suave():
    bogota = performance.compact(garmin("2026-09-20", 10, 60, 150, [0, 0, 60, 0, 0]))
    costa = performance.compact(garmin("2026-09-21", 10, 60, 150, [0, 0, 60, 0, 0], elev=5))
    fuerte = performance.compact(garmin("2026-09-22", 10, 50, 170, [0, 0, 0, 50, 0]))
    assert performance._efficiency(bogota) is not None
    assert performance._efficiency(costa) is None
    assert performance._efficiency(fuerte) is None
