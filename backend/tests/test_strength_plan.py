"""El bloque de fuerza no puede seguir anunciando sesiones que ya pasaron.

El 14 de septiembre de 2026 (lunes) la app seguía sirviendo el gimnasio del 7 y
del 9 como parte de "lo que viene": `gym_dates()` devuelve el bloque entero, y
todo lo que mira hacia adelante — el calendario de /gym, las strength_sessions
del plan aumentado y el bloque que se le inyecta a Claude — lo usaba tal cual.
Estas pruebas fijan el corte.
"""
from __future__ import annotations

from datetime import date

import strength_plan


# Lunes 14-sep-2026: la semana W13 del bloque real, con W12 (7 y 9) ya pasada.
LUNES_14 = date(2026, 9, 14)
DOMINGO_13 = date(2026, 9, 13)
DOMINGO_20 = date(2026, 9, 20)


def test_week_start_es_el_domingo_de_la_semana_en_curso():
    # El domingo es su propio inicio de semana, no el de la anterior.
    assert strength_plan.week_start(DOMINGO_13) == DOMINGO_13
    assert strength_plan.week_start(LUNES_14) == DOMINGO_13
    assert strength_plan.week_start(date(2026, 9, 19)) == DOMINGO_13
    assert strength_plan.week_start(DOMINGO_20) == DOMINGO_20


def test_gym_dates_from_deja_fuera_la_semana_pasada():
    fechas = strength_plan.gym_dates_from(strength_plan.week_start(LUNES_14))
    assert "2026-09-07" not in fechas
    assert "2026-09-09" not in fechas
    assert fechas["2026-09-14"] == "A"
    assert fechas["2026-09-16"] == "B"


def test_gym_dates_from_conserva_toda_la_semana_en_curso():
    """El corte es semanal, no diario: el miércoles la sesión del lunes sigue
    saliendo, porque la app enseña la semana entera y las dos vistas tienen que
    coincidir."""
    miercoles = strength_plan.gym_dates_from(strength_plan.week_start(date(2026, 9, 16)))
    assert "2026-09-14" in miercoles


def test_gym_dates_sigue_devolviendo_el_bloque_entero():
    """El calendario del bloque no se toca: /gym lo sirve en `weeks` y la vista
    de gimnasio resuelve con él la semana vigente."""
    assert "2026-09-07" in strength_plan.gym_dates()


def test_prompt_block_no_le_da_a_claude_fechas_viejas():
    bloque = strength_plan.prompt_block(DOMINGO_13)
    assert "2026-09-07" not in bloque
    assert "2026-09-14" in bloque
    assert "2026-09-28" in bloque


# ── Bloque hacia el medio del 29-nov ─────────────────────────────────────────


def test_la_ultima_pesada_es_13_dias_antes_de_la_carrera():
    fechas = strength_plan.gym_dates()
    pesadas = sorted(d for d, code in fechas.items() if code == "A")
    assert pesadas[-1] == "2026-11-16"
    assert (strength_plan.RACE_DATE - date(2026, 11, 16)).days == 13


def test_la_semana_de_carrera_solo_lleva_mantenimiento():
    semana = strength_plan.gym_dates_between(date(2026, 11, 23), date(2026, 11, 29))
    assert semana == {"2026-11-23": "M"}


def test_el_gimnasio_no_cae_en_dias_de_calidad_ni_tirada_larga():
    # Runna R1–R9: calidad los jueves, tirada larga los domingos.
    for d in strength_plan.gym_dates():
        assert date.fromisoformat(d).weekday() in (0, 2), d
