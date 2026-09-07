"""resolve_athlete es la frontera entre la URL y el disco: cualquier cosa que
llegue por query param tiene que caer en un atleta conocido, porque de eso
depende qué archivo se lee o se escribe. Nunca lanza.
"""
import pytest

from athletes import resolve_athlete


@pytest.mark.parametrize(
    ("raw", "esperado"),
    [
        ("jose", "jose"),
        ("andrea", "andrea"),
        ("ANDREA", "andrea"),
        (None, "jose"),
        ("", "jose"),
        ("../../etc", "jose"),
        ("pepito", "jose"),
    ],
)
def test_cualquier_basura_cae_en_un_atleta_conocido(raw, esperado):
    assert resolve_athlete(raw) == esperado
