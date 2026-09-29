"""Las carreras ajustadas son nuestras: no entran al plan de Runna que se revisa."""
from __future__ import annotations

from datetime import date, timedelta

import fetch_garmin


class _FakeClient:
    def __init__(self, items):
        self.items = items

    def get_scheduled_workouts(self, year, month):
        return {"calendarItems": self.items}


def test_las_ajustadas_no_vuelven_a_entrar_al_plan():
    d = (date.today() + timedelta(days=3)).isoformat()
    items = [
        {"itemType": "workout", "id": 1, "date": d, "title": "19km Long Run", "sportTypeKey": "running", "workoutId": 10},
        {"itemType": "workout", "id": 2, "date": d, "title": "Ajustado · 19km Long Run", "sportTypeKey": "running", "workoutId": 20},
    ]
    plan = fetch_garmin.fetch_scheduled_workouts(_FakeClient(items), days_ahead=10)
    assert [s["name"] for s in plan] == ["19km Long Run"]
