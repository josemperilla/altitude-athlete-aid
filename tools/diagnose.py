"""
Pain/injury diagnosis tool. The user describes a physical complaint interactively.
Claude evaluates it against the current week's training plan and returns:
  - Pain classification (minor / moderate / severe)
  - Adjusted cycling sessions
  - Optional Runna session warnings (never auto-modified)

Runna sessions are NEVER automatically changed. Any recommendation is advisory only.

Usage: python tools/diagnose.py
"""
import json
import os
import sys
from pathlib import Path
from datetime import date

import anthropic
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GARMIN_DATA = ROOT / ".tmp" / "garmin_data.json"
RESEARCH_CTX = ROOT / "context" / "research_insights.md"
OUTPUT_DIAGNOSIS = ROOT / ".tmp" / "diagnosis.json"

SYSTEM_PROMPT = """You are a sports medicine-informed endurance training advisor. A runner preparing
for a half marathon in Bogotá (altitude ~2,600m) has described a pain or physical complaint.
Your role is to evaluate the complaint in the context of their current training plan and
recommend conservative adjustments.

RESEARCH CONTEXT (peer-reviewed papers on endurance training):
{research}

RULES:
1. Runna running sessions are READ-ONLY. Never instruct the user to modify them automatically.
   Only issue a ⚠️ RECOMMENDATION if a session poses serious injury risk (severity ≥ 8/10,
   stress fracture indicators, swelling, acute tendon pain).
2. Cycling sessions CAN be adjusted — reduce intensity, shorten duration, or replace with rest.
3. Always err on the side of caution. If uncertain, recommend rest and professional evaluation.
4. Do not diagnose medical conditions. Recommend a sports medicine professional for anything
   that may require imaging or clinical assessment.

OUTPUT FORMAT — respond with a single valid JSON object:
{{
  "pain_summary": "string: restate the complaint in clinical terms",
  "classification": "minor | moderate | severe",
  "classification_rationale": "string: why this classification",
  "cycling_adjustments": [
    {{
      "date": "YYYY-MM-DD",
      "original_session": "string",
      "adjusted_session": "string (or 'REST')",
      "reason": "string"
    }}
  ],
  "runna_warnings": [
    {{
      "date": "YYYY-MM-DD",
      "session": "string",
      "warning": "⚠️ RECOMMENDATION (advisory only, not auto-applied): string"
    }}
  ],
  "return_to_full_load_estimate": "string: e.g. '3-5 days' or 'after medical evaluation'",
  "general_advice": "string: 2-3 sentences on managing the complaint during training",
  "seek_professional_care": true | false
}}
"""


def collect_pain_input() -> dict:
    print("=" * 60)
    print("TRAINING DIAGNOSIS — Pain & Injury Assessment")
    print("=" * 60)
    print("Answer the following questions. Press Enter to skip optional ones.\n")

    location = input("📍 Where is the pain? (e.g. left knee, right Achilles, shin): ").strip()
    severity = input("🔢 Severity 1–10 (1=barely noticeable, 10=unbearable): ").strip()
    pain_type = input("📋 Type of pain? (e.g. sharp, dull ache, burning, stiffness): ").strip()
    when_occurs = input("⏱  When does it occur? (e.g. during run, after, at rest, morning): ").strip()
    duration = input("📅 How long have you had this? (e.g. 2 days, since yesterday): ").strip()
    swelling = input("🔍 Any swelling, redness or bruising? (yes/no): ").strip()
    extra = input("💬 Anything else to add? (optional): ").strip()

    return {
        "location": location,
        "severity": severity,
        "pain_type": pain_type,
        "when_occurs": when_occurs,
        "duration": duration,
        "swelling": swelling,
        "additional_notes": extra,
    }


def load_inputs() -> tuple[dict | None, str]:
    garmin = None
    if GARMIN_DATA.exists():
        garmin = json.loads(GARMIN_DATA.read_text(encoding="utf-8"))
    else:
        print("NOTE: No Garmin data found. Run fetch_garmin.py for full context.", file=sys.stderr)

    if not RESEARCH_CTX.exists():
        print(f"ERROR: {RESEARCH_CTX} not found. Run tools/extract_papers.py first.", file=sys.stderr)
        sys.exit(1)

    research = RESEARCH_CTX.read_text(encoding="utf-8")
    return garmin, research


def call_claude(pain: dict, garmin: dict | None, research: str) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    system = SYSTEM_PROMPT.format(research=research[:30000])

    training_ctx = ""
    if garmin:
        weekly = garmin.get("weekly_plan", [])
        cycling = garmin.get("cycling_sessions", [])  # from augmented plan if available
        training_ctx = f"""
CURRENT WEEK'S RUNNING PLAN (Runna — read-only):
{json.dumps(weekly, indent=2)}

PLANNED CYCLING SESSIONS (adjustable):
{json.dumps(cycling, indent=2)}
"""
    else:
        training_ctx = "No training data available — give general advice based on the complaint."

    user_msg = f"""Today: {date.today().isoformat()}
Altitude context: Bogotá (~2,600m)

ATHLETE COMPLAINT:
{json.dumps(pain, indent=2)}

{training_ctx}

Evaluate the complaint and return the JSON diagnosis object."""

    print("\nAnalyzing complaint with Claude...")
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]

    return json.loads(raw.strip())


def print_report(diagnosis: dict):
    level = diagnosis.get("classification", "unknown").upper()
    emoji = {"MINOR": "🟡", "MODERATE": "🟠", "SEVERE": "🔴"}.get(level, "⚪")

    print("\n" + "=" * 60)
    print(f"DIAGNOSIS REPORT — {emoji} {level}")
    print("=" * 60)
    print(f"\n{diagnosis.get('pain_summary', '')}")
    print(f"\nReason: {diagnosis.get('classification_rationale', '')}")

    adjustments = diagnosis.get("cycling_adjustments", [])
    if adjustments:
        print("\n--- CYCLING ADJUSTMENTS ---")
        for a in adjustments:
            print(f"  {a['date']}: {a['original_session']} → {a['adjusted_session']}")
            print(f"          Reason: {a['reason']}")

    warnings = diagnosis.get("runna_warnings", [])
    if warnings:
        print("\n--- RUNNA SESSION WARNINGS (advisory only — YOU decide) ---")
        for w in warnings:
            print(f"  {w['date']}: {w['session']}")
            print(f"          {w['warning']}")

    print(f"\nReturn to full load: {diagnosis.get('return_to_full_load_estimate', '—')}")
    print(f"\nAdvice: {diagnosis.get('general_advice', '')}")

    if diagnosis.get("seek_professional_care"):
        print("\n🏥 RECOMMENDATION: Consult a sports medicine professional before your next hard session.")


def main():
    garmin, research = load_inputs()
    pain = collect_pain_input()
    diagnosis = call_claude(pain, garmin, research)

    OUTPUT_DIAGNOSIS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIAGNOSIS.write_text(json.dumps(diagnosis, indent=2, ensure_ascii=False), encoding="utf-8")

    print_report(diagnosis)
    print(f"\nFull report saved → {OUTPUT_DIAGNOSIS}")


if __name__ == "__main__":
    main()
