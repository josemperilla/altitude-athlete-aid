#!/usr/bin/env python3
"""
dealer_check — valida que una rama de carril solo tocó los archivos que posee.

Corre en CI sobre cada push a dealer/*. Es la unica capa que atrapa por igual a
los agentes locales y a los cloud: los hooks locales no los corren los remotos.

Uso:
    dealer_check.py                  # infiere el carril de la rama actual
    dealer_check.py --lane glm-5.2
    dealer_check.py --lock .dealer/lock.json --lane glm-5.2

Salida: 0 si todo esta en zona, 1 si hay fugas o error de config.
Sin dependencias externas.
"""

import argparse
import json
import os
import re
import subprocess
import sys


def sh(*args):
    return subprocess.run(args, capture_output=True, text=True).stdout.strip()


def glob_to_regex(pattern):
    """Traduce un glob a regex. `**` cruza `/`, `*` y `?` no."""
    out, i, n = [], 0, len(pattern)
    while i < n:
        c = pattern[i]
        if c == "*":
            if i + 1 < n and pattern[i + 1] == "*":
                out.append(".*")
                i += 2
                if i < n and pattern[i] == "/":
                    i += 1
                continue
            out.append("[^/]*")
        elif c == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(c))
        i += 1
    return re.compile("^" + "".join(out) + "$")


def matches_any(path, patterns):
    return any(p.match(path) for p in patterns)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lock", default=".dealer/lock.json")
    ap.add_argument("--lane", default=None)
    ap.add_argument("--base", default=None, help="override del tag base")
    args = ap.parse_args()

    if not os.path.exists(args.lock):
        print(f"dealer-check: no existe {args.lock} — ¿rama fuera de un run?")
        return 0

    with open(args.lock) as f:
        lock = json.load(f)

    lane = args.lane or os.environ.get("DEALER_LANE")
    if not lane:
        branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
        parts = branch.split("/")
        if len(parts) >= 3 and parts[0] == "dealer":
            lane = parts[1]

    if not lane or lane not in lock["lanes"]:
        print(f"dealer-check: no pude identificar el carril (lane={lane!r})")
        print(f"  carriles en el lock: {', '.join(lock['lanes'])}")
        return 1

    cfg = lock["lanes"][lane]
    base = args.base or lock["base"]
    mode = lock.get("mode", "split")

    merge_base = sh("git", "merge-base", "HEAD", base)
    if not merge_base:
        print(f"dealer-check: no encuentro el base {base}. ¿Falta `git fetch --tags`?")
        return 1

    changed = [
        p for p in sh("git", "diff", "--name-only", f"{merge_base}..HEAD").splitlines() if p
    ]
    if not changed:
        print("dealer-check: sin cambios respecto al base.")
        return 0

    owns = [glob_to_regex(g) for g in cfg.get("owns", [])]
    implicit = [
        glob_to_regex(f".dealer/envelopes/{lane}.md"),
        glob_to_regex(f".dealer/requests/{lane}.md"),
        glob_to_regex(f".dealer/status/{lane}.json"),
    ]
    allowed = owns + implicit
    seams = [glob_to_regex(g) for g in lock.get("seams", [])]

    leaks = [p for p in changed if not matches_any(p, allowed)]

    print(f"dealer-check | carril: {lane} | modo: {mode} | base: {base}")
    print(f"  archivos cambiados: {len(changed)}")

    if not leaks:
        print("  OK — todo dentro de la zona del carril.")
        return 0

    print(f"\n  FUERA DE ZONA ({len(leaks)}):")
    for p in leaks:
        tag = "  [COSTURA — intocable]" if matches_any(p, seams) else ""
        print(f"    - {p}{tag}")

    print("\n  Tu zona:")
    for g in cfg.get("owns", []):
        print(f"    {g}")
    print(f"    .dealer/envelopes/{lane}.md")
    print(f"    .dealer/requests/{lane}.md")
    print(f"    .dealer/status/{lane}.json")

    print(
        f"\n  Que hacer: revierte esos archivos "
        f"(git checkout {merge_base} -- <archivo>) y convierte lo que "
        f"necesitabas en un REQUEST dentro de .dealer/requests/{lane}.md"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
