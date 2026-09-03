# Workflow: Weekly Training Optimization

## Objective
Augment your Runna half-marathon plan with science-backed cycling sessions that increase aerobic capacity without extra impact load, and upload them to Garmin so Runna tracks your efforts automatically.

## When to run
Every Monday (or the first day of your Runna week) before your first session.

## Prerequisites
- `.env` file with `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `ANTHROPIC_API_KEY`
- Virtual environment activated: `source .venv/bin/activate`
- Papers extracted (run once): `python tools/extract_papers.py`

---

## Step-by-Step

### STEP 0 — (Optional) Diagnose any pain first
If you have any ache, soreness, or discomfort:
```bash
python tools/diagnose.py
```
- Describe the pain interactively (location, severity 1–10, type, timing)
- Claude evaluates it and adjusts cycling sessions accordingly
- **Runna sessions are never auto-modified** — any warning is advisory only
- If severity ≥ 8 or you see a 🏥 recommendation, consult a sports medicine professional before proceeding

---

### STEP 1 — Fetch your Garmin data
```bash
python tools/fetch_garmin.py
```
Pulls from Garmin Connect:
- Your Runna-synced running plan for the next 7 days
- Last 21 days of activities (runs + rides)
- HRV, sleep, resting HR for last 21 days
- Your personal HR zone boundaries

Output: `.tmp/garmin_data.json`

---

### STEP 2 — Generate the augmented plan
```bash
python tools/generate_plan.py
```
Claude reads your data + 5 peer-reviewed papers and:
- Classifies your athlete state (underloaded / balanced / fatigued)
- Adds 2–4 cycling sessions to open days following a polarized approach (≥75% Z1)
- Ensures no Z2 cycling adjacent to hard running sessions
- Applies Bogotá altitude modifier (−10–15% Z2 duration vs sea level)
- Generates Garmin-format workout files with your exact HR zone BPM targets

Outputs:
- `.tmp/augmented_plan.json` — full weekly plan + rationale
- `.tmp/workouts/YYYY-MM-DD_cycling.json` — one per cycling session

---

### STEP 3 — Review the plan
Open `.tmp/augmented_plan.json` and check:
- Runna sessions are unchanged
- Cycling sessions fit your schedule
- Zone distribution is polarized (Z1 dominant)

If you want to remove a cycling session, delete its file from `.tmp/workouts/` before Step 4.

---

### STEP 4 — Upload to Garmin (preview first)
```bash
# Dry run — see what will be uploaded without actually doing it
python tools/upload_workouts.py --dry-run

# Upload and schedule on Garmin Connect
python tools/upload_workouts.py
```
Cycling workouts appear in your Garmin training calendar.

---

### STEP 5 — Sync your Garmin device
Sync your watch with the Garmin Connect app. The cycling workouts will appear as structured workouts ready to follow during the session.

---

### STEP 6 — Complete the sessions
When you complete a cycling workout on your Garmin device:
1. It syncs automatically to Garmin Connect as a completed activity
2. Runna reads Garmin activities and displays them in your training feed as cross-training
3. Your effort counts toward your weekly training load in Runna

---

## Scientific Basis
All cycling session decisions are grounded in:

| Paper | Key finding applied |
|-------|---------------------|
| Seiler & Tønnessen (2009) | 80/20 rule: ≥80% training below LT1 |
| Muñoz et al. (2014) | Polarized beats threshold for recreational runners (5% vs 3.6% improvement) |
| Rivera-Köfler et al. (2024) | POL/PYR superior to threshold model for VO2max |
| Silva Oliveira et al. (2024) | POL superior for VO2peak especially in <12-week interventions |
| Sandbakk et al. (2025) | World-class coaches: 2-3 key sessions/week, rest is Z1; cycling used for load without impact |

---

## Fatigue Decision Logic

| Signal | Action |
|--------|--------|
| HRV ↓ + Resting HR ↑ | Switch all cycling to Z1 recovery (30–45 min) |
| HRV stable, load balanced | Mix of Z1 (primary) + one Z2 session if no hard run nearby |
| HRV ↑, underloaded | Add Z2 session, extend Z1 rides slightly |
| Diagnose: severity ≥ 6 | Reduce cycling to Z1 only; flag session for review |
| Diagnose: severity ≥ 8 | Rest from cycling; ⚠️ advisory on Runna sessions; seek care |

---

## Updating the Workflow
If you encounter errors or learn something new:
1. Fix the relevant tool in `tools/`
2. Document the fix here under a **Lessons Learned** section
3. Re-run from Step 1

## File Reference
```
.env                         ← credentials (never commit to git)
tools/extract_papers.py      ← one-time paper extraction
tools/fetch_garmin.py        ← weekly data pull
tools/generate_plan.py       ← AI plan generation
tools/upload_workouts.py     ← upload to Garmin calendar
tools/diagnose.py            ← pain/injury assessment
context/research_insights.md ← extracted paper text (reused weekly)
.tmp/garmin_data.json        ← latest Garmin pull
.tmp/augmented_plan.json     ← this week's full plan
.tmp/workouts/               ← Garmin workout JSONs
.tmp/diagnosis.json          ← latest injury report
```
