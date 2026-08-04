"""
Reads PDFs from Running_papers/ and produces context/research_insights.md.

Smart caching: tracks each PDF's size+mtime in context/papers_cache.json.
- If no PDFs changed/added/removed → reuses existing research_insights.md instantly.
- Only re-extracts PDFs that are new or modified.
- Removes entries for deleted PDFs from the cache.

Usage: python tools/extract_papers.py
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).parent.parent
PAPERS_DIR   = ROOT / "Running_papers"
OUTPUT_FILE  = ROOT / "context" / "research_insights.md"
CACHE_FILE   = ROOT / "context" / "papers_cache.json"


# ── Fingerprint ────────────────────────────────────────────────────────────────

def _fingerprint(path: Path) -> str:
    """Fast fingerprint: mtime + size (avoids reading large PDFs just to check)."""
    stat = path.stat()
    return f"{stat.st_mtime_ns}:{stat.st_size}"


# ── PDF extraction ─────────────────────────────────────────────────────────────

def extract_text(pdf_path: Path, max_chars: int = 12000) -> str:
    reader = PdfReader(str(pdf_path))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
        if len(text) >= max_chars:
            break
    return text[:max_chars]


# ── Cache management ───────────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_cache(cache: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Main ───────────────────────────────────────────────────────────────────────

HEADER = """# Running Science Research Insights

Distilado de investigación científica revisada por pares (2009–2025).
Usado como contexto científico en la generación de planes y diagnósticos.

**Principio central**: Distribución polarizada (≥75-80% Z1, <10% Z2, 15-20% Z3)
supera al entrenamiento de umbral para mejora de rendimiento en corredores de fondo.
El ciclismo añade volumen aeróbico sin impacto mecánico — ideal para adaptación en altitud.
HRV bajo + FC reposo elevada = fatiga → priorizar Z1, reducir carga.

---

"""


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    pdfs = {p: _fingerprint(p) for p in sorted(PAPERS_DIR.glob("*.pdf"))}
    if not pdfs:
        print(f"No PDFs found in {PAPERS_DIR}", file=sys.stderr)
        sys.exit(1)

    cache = load_cache()

    # Determine what changed
    cached_names  = set(cache.keys())
    current_names = {p.name for p in pdfs}
    new_pdfs      = [p for p in pdfs if p.name not in cached_names]
    removed_names = cached_names - current_names
    changed_pdfs  = [
        p for p in pdfs
        if p.name in cached_names and pdfs[p] != cache[p.name]["fingerprint"]
    ]
    unchanged_pdfs = [
        p for p in pdfs
        if p.name in cached_names and pdfs[p] == cache[p.name]["fingerprint"]
    ]

    needs_rebuild = bool(new_pdfs or removed_names or changed_pdfs)

    if not needs_rebuild and OUTPUT_FILE.exists():
        print(f"✓ Sin cambios en papers ({len(pdfs)} PDFs). Usando caché existente.")
        print(f"  → {OUTPUT_FILE}")
        return

    # Report changes
    if new_pdfs:
        print(f"  + Nuevos: {[p.name for p in new_pdfs]}")
    if removed_names:
        print(f"  - Eliminados: {list(removed_names)}")
    if changed_pdfs:
        print(f"  ~ Modificados: {[p.name for p in changed_pdfs]}")

    # Remove deleted entries from cache
    for name in removed_names:
        del cache[name]

    # Extract only new/changed PDFs
    to_extract = new_pdfs + changed_pdfs
    for pdf in to_extract:
        print(f"  Extrayendo: {pdf.name}")
        text = extract_text(pdf)
        cache[pdf.name] = {
            "fingerprint": pdfs[pdf],
            "text": text,
        }

    # For unchanged PDFs: text already in cache, nothing to do
    for pdf in unchanged_pdfs:
        print(f"  ✓ Caché: {pdf.name}")

    # Rebuild the combined markdown in consistent order
    sections = []
    for pdf in sorted(pdfs.keys(), key=lambda p: p.name):
        text = cache[pdf.name]["text"]
        sections.append(f"### {pdf.stem}\n\n{text}\n")

    output = HEADER + "\n\n---\n\n".join(sections)
    OUTPUT_FILE.write_text(output, encoding="utf-8")
    save_cache(cache)

    print(f"\n✓ Escrito: {OUTPUT_FILE} ({len(output):,} chars, {len(pdfs)} papers)")
    if to_extract:
        print(f"  Re-extraídos: {len(to_extract)} | Del caché: {len(unchanged_pdfs)}")


if __name__ == "__main__":
    main()
