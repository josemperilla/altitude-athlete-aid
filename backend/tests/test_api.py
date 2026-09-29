"""La API de un solo atleta (José) y el latido de /health.

Hasta el 29-sep-2026 la app tuvo dos perfiles y cada ruta llevaba ?athlete=.
Se retiró el segundo: las rutas ya no lo leen, y un frontend viejo que lo siga
mandando tiene que recibir lo mismo que uno nuevo.
"""
import json


def test_gym_trae_la_carrera_y_el_calendario(make_client, tmp_path):
    client = make_client(tmp_path)
    gym = client.get("/gym").json()

    assert gym["race"]["name"] == "Medio maratón en Bogotá"
    assert gym["race"]["race_date"] == "2026-11-29"
    # Fechas serializadas: si as_dict dejara pasar un `date`, el JSON no saldría.
    assert gym["race"]["block_start"] == "2026-09-28"
    assert gym["race_date"] == gym["race"]["race_date"]
    # Sin plan ni Garmin en disco el calendario existe, vacío; la guía de fuerza sirve igual.
    assert isinstance(gym["calendar"], list)
    assert "A" in gym["sessions"]


def test_un_athlete_viejo_en_la_url_se_ignora(make_client, tmp_path):
    client = make_client(tmp_path)
    assert client.get("/gym?athlete=otro").json()["race"] == client.get("/gym").json()["race"]
    client.post("/gym/done?athlete=otro", json={"date": "2026-09-08", "code": "A"})
    # El registro cae en el único archivo que hay, el de José.
    assert client.get("/gym/done").json()["2026-09-08"]["code"] == "A"
    assert (tmp_path / "gym_done_jose.json").exists()


def test_gym_done_guarda_pesos_y_devuelve_el_mapa_por_fecha(make_client, tmp_path):
    client = make_client(tmp_path)
    assert client.get("/gym/done").json() == {}

    response = client.post(
        "/gym/done", json={"date": "2026-09-07", "code": "A", "weights": {"squat": "80kg"}}
    )
    assert response.status_code == 200
    assert client.get("/gym/done").json()["2026-09-07"]["weights"]["squat"] == "80kg"


def test_gym_done_con_done_false_borra_solo_esa_fecha(make_client, tmp_path):
    client = make_client(tmp_path)
    client.post("/gym/done", json={"date": "2026-09-08", "code": "A"})
    client.post("/gym/done", json={"date": "2026-09-10", "code": "B"})

    response = client.post("/gym/done", json={"date": "2026-09-08", "code": "A", "done": False})

    assert "2026-09-08" not in response.json()
    assert "2026-09-10" in response.json()


def test_health_sin_latido_es_null_con_200(make_client, tmp_path):
    client = make_client(tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"last_run": None}


def test_health_con_latido_lo_devuelve(make_client, tmp_path):
    (tmp_path / "last_run.json").write_text(
        json.dumps(
            {
                "last_run": "2026-09-06T04:00:12",
                "steps_ok": ["fetch_garmin.py", "generate_plan.py", "upload_workouts.py"],
            }
        ),
        encoding="utf-8",
    )
    client = make_client(tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["last_run"] == "2026-09-06T04:00:12"


def test_update_exitoso_escribe_el_latido(make_client, tmp_path, monkeypatch):
    """El disparador de GitHub Actions llama POST /update, NO run_weekly.sh.

    Si el latido viviera solo en el script, /health se quedaría en null para
    siempre por esa vía y el aviso de "plan viejo" no saltaría nunca — que es
    exactamente lo contrario de para lo que existe.
    """
    client = make_client(tmp_path)
    import api

    monkeypatch.setattr(api, "_run_tool", lambda script: (True, "ok"))
    assert client.get("/health").json() == {"last_run": None}

    assert client.post("/update").status_code == 200
    assert client.get("/health").json()["last_run"] is not None


def test_update_fallido_no_escribe_latido(make_client, tmp_path, monkeypatch):
    """Un latido que miente es peor que ninguno: si un paso se cae, no se marca."""
    client = make_client(tmp_path)
    import api

    monkeypatch.setattr(api, "_run_tool", lambda script: (False, "reventó"))
    assert client.post("/update").status_code == 500
    assert client.get("/health").json() == {"last_run": None}
