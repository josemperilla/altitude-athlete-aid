"""
Registro compartido de uso/costo de las llamadas a Claude, para poder comparar
antes/después de una optimización de prompt. Usado por generate_plan.py y por
el endpoint /diagnose en api.py.

Output: .tmp/usage_log.jsonl (una línea JSON por llamada)
"""
import json
from datetime import datetime
from pathlib import Path

from paths import data_file

ROOT = Path(__file__).parent.parent
USAGE_LOG = data_file("usage_log.jsonl")

# Precios Claude Sonnet 4.6, por millón de tokens.
PRICE_INPUT_PER_M = 3.0
PRICE_OUTPUT_PER_M = 15.0
PRICE_CACHE_WRITE_PER_M = PRICE_INPUT_PER_M * 1.25  # TTL efímero de 5 min
PRICE_CACHE_READ_PER_M = PRICE_INPUT_PER_M * 0.1


def log_usage(usage, label: str) -> float:
    """Añade una línea a .tmp/usage_log.jsonl y devuelve el costo en USD."""
    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0

    cost = (
        input_tokens * PRICE_INPUT_PER_M
        + output_tokens * PRICE_OUTPUT_PER_M
        + cache_write * PRICE_CACHE_WRITE_PER_M
        + cache_read * PRICE_CACHE_READ_PER_M
    ) / 1_000_000

    entry = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "label": label,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_creation_input_tokens": cache_write,
        "cache_read_input_tokens": cache_read,
        "cost_usd": round(cost, 4),
    }
    USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with USAGE_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"  → Uso ({label}): {input_tokens} in / {output_tokens} out — ${cost:.4f}")
    return cost
