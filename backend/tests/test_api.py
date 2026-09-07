"""Aislamiento entre José y Andrea a nivel HTTP, y el latido de /health.

Mismas pesas (el gimnasio es conjunto), distintas carreras: lo único que
cambia entre ?athlete=jose y ?athlete=andrea es `race` y el calendario de
carrera, que es de José y no debe filtrarse a Andrea.
"""
import json


def test_gym_fuerza_compartida_y_carrera_distinta(make_client, tmp_path):
    client = make_client(tmp_path)
    jose = client.get("/gym?athlete=jose").json()
    andrea = client.get("/gym?athlete=andrea").json()

    assert jose["race"]["name"] == "Media Maratón del Meta"
    assert andrea["race"]["name"] == "Maratón de Chicago"
    assert andrea["race"]["race_date"] == "2026-10-11"
    # El gimnasio es conjunto: mismas sesiones, semanas y reglas para los dos.
    assert andrea["sessions"] == jose["sessions"]
    assert andrea["weeks"] == jose["weeks"]
    assert andrea["rules"] == jose["rules"]


def test_gym_andrea_sin_calendario_de_carrera(make_client, tmp_path):
    client = make_client(tmp_path)
    andrea = client.get("/gym?athlete=andrea").json()
    jose = client.get("/gym?athlete=jose").json()

    assert andrea["calendar"] == []
    assert andrea["athlete_state"] is None
    # A José el calendario se le arma como lista aunque no haya datos locales;
    # la clave existe para los dos, vacía para quien no tiene Garmin.
    assert isinstance(jose["calendar"], list)


def test_garmin_y_plan_de_andrea_vacio_con_200(make_client, tmp_path):
    client = make_client(tmp_path)
    for path in ("/garmin?athlete=andrea", "/plan?athlete=andrea"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.json() == {}


def test_gym_done_de_un_atleta_no_pisa_al_otro(make_client, tmp_path):
    client = make_client(tmp_path)

    response = client.post(
        "/gym/done?athlete=andrea", json={"date": "2026-09-08", "code": "A"}
    )
    assert response.status_code == 200
    assert response.json()["2026-09-08"]["code"] == "A"

    joint = client.get("/gym/done").json()
    assert joint["andrea"]["2026-09-08"]["code"] == "A"
    assert joint["jose"] == {}

    client.post(
        "/gym/done?athlete=jose",
        json={"date": "2026-09-07", "code": "A", "weights": {"squat": "80kg"}},
    )
    joint = client.get("/gym/done").json()
    assert joint["jose"]["2026-09-07"]["weights"]["squat"] == "80kg"
    # El registro de Andrea quedó intacto tras el POST de José.
    assert joint["andrea"]["2026-09-08"]["code"] == "A"


def test_gym_done_con_done_false_borra_solo_esa_fecha(make_client, tmp_path):
    client = make_client(tmp_path)
    client.post("/gym/done?athlete=andrea", json={"date": "2026-09-08", "code": "A"})
    client.post("/gym/done?athlete=andrea", json={"date": "2026-09-10", "code": "B"})

    response = client.post(
        "/gym/done?athlete=andrea", json={"date": "2026-09-08", "code": "A", "done": False}
    )

    assert "2026-09-08" not in response.json()
    assert "2026-09-10" in response.json()


def test_get_gym_done_siempre_devuelve_las_dos_claves(make_client, tmp_path):
    client = make_client(tmp_path)
    joint = client.get("/gym/done").json()
    assert joint == {"jose": {}, "andrea": {}}


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
