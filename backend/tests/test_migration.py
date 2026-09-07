"""La migración que protege el historial real de José en el volumen de
Railway: diagnosis.json (legado, de cuando había un solo atleta) se copia a
diagnosis_jose.json al importar la app — y solo si ese último no existe.
"""
import json


def test_diagnosis_legado_migra_a_jose(make_client, tmp_path):
    legado = {"pain_summary": "historial legado", "classification": "minor"}
    (tmp_path / "diagnosis.json").write_text(
        json.dumps(legado, ensure_ascii=False), encoding="utf-8"
    )

    client = make_client(tmp_path)

    nuevo = tmp_path / "diagnosis_jose.json"
    assert nuevo.exists(), "la migración debió crear diagnosis_jose.json"
    assert json.loads(nuevo.read_text(encoding="utf-8")) == legado
    # Y lo sirve el endpoint, bajo su atleta.
    assert client.get("/diagnosis?athlete=jose").json() == legado


def test_no_pisa_un_diagnosis_jose_existente(make_client, tmp_path):
    (tmp_path / "diagnosis.json").write_text('{"pain_summary": "viejo"}', encoding="utf-8")
    (tmp_path / "diagnosis_jose.json").write_text('{"pain_summary": "nuevo"}', encoding="utf-8")

    make_client(tmp_path)

    contenido = json.loads((tmp_path / "diagnosis_jose.json").read_text(encoding="utf-8"))
    assert contenido == {"pain_summary": "nuevo"}
