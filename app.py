import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic
import plotly.graph_objects as go
import streamlit as st
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

GARMIN_DATA  = ROOT / ".tmp" / "garmin_data.json"
PLAN_DATA    = ROOT / ".tmp" / "augmented_plan.json"
DIAGNOSIS    = ROOT / ".tmp" / "diagnosis.json"
RESEARCH_CTX = ROOT / "context" / "research_insights.md"

SPORT_EMOJI = {
    "running": "🏃",
    "cycling": "🚴",
    "swimming": "🏊",
    "open_water_swimming": "🏊",
    "breathwork": "🧘",
    "assistance": "💪",
    "strength_training": "💪",
}
ZONE_COLOR = {"Z1": "#4CAF50", "Z2": "#FF9800", "Z3": "#F44336",
              "Z4": "#9C27B0", "Z5": "#212121"}
DAY_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]  # semana inicia domingo
MONTH_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
            "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

st.set_page_config(
    page_title="Entrenador · Bogotá",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

GLOBAL_CSS = """<style>
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap');

:root {
  --gold:       #E9CEA9;
  --gold-dark:  #CEA970;
  --gold-light: #FFBC7D;
  --gold-dim:   rgba(233,206,169,.15);
  --gold-dim2:  rgba(233,206,169,.08);
  --bg:         #020101;
  --bg-card:    #111111;
  --bg-card2:   #1A1A1A;
  --bg-sidebar: #0D0D0D;
  --border:     1px solid rgba(233,206,169,.12);
  --text:       #FFFFFF;
  --text-muted: #9A9A9A;
  --run:        #3B82F6;
  --ride:       #10B981;
  --red:        #EF4444;
  --radius:     8px;
  --shadow:     0 4px 20px rgba(0,0,0,.4);
}

@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap');
html,body,[class*="css"]{ font-family:'Hanken Grotesk',sans-serif !important; color:var(--text) !important; }
footer { visibility:hidden; }

/* App background */
.stApp{ background:var(--bg) !important; }
.main .block-container{ background:var(--bg) !important; padding-top:2rem; }

/* Top bar — dorado oscuro */
[data-testid="stHeader"]{
  background:linear-gradient(90deg,#0D0D0D 0%,#1A1410 100%) !important;
  border-bottom:1px solid rgba(233,206,169,.2) !important;
}
[data-testid="stHeader"] *{ color:var(--gold) !important; }
[data-testid="stDecoration"]{ background:var(--gold) !important; height:2px !important; }

/* Sidebar */
[data-testid="stSidebar"]{
  background:var(--bg-sidebar) !important;
  border-right:1px solid rgba(233,206,169,.1) !important;
}
[data-testid="stSidebar"] *{ color:var(--text) !important; }

/* Tabs */
.stTabs [data-baseweb="tab-list"]{
  gap:2px; background:#0D0D0D; border-radius:var(--radius);
  padding:4px; border:1px solid rgba(233,206,169,.1);
}
.stTabs [data-baseweb="tab"]{
  border-radius:6px; font-weight:600; font-size:.8rem; letter-spacing:.5px;
  text-transform:uppercase; color:var(--text-muted) !important;
  padding:8px 18px; background:transparent !important; border:none !important;
}
.stTabs [aria-selected="true"]{
  background:var(--gold-dim) !important; color:var(--gold) !important;
}

/* Buttons — dorado oscuro para que se lea bien */
.stButton>button{
  background:var(--gold-dark) !important; color:#020101 !important;
  border:none !important; border-radius:6px !important;
  font-weight:800 !important; font-size:.85rem !important;
  letter-spacing:.8px !important; text-transform:uppercase !important;
  padding:12px 20px !important; transition:background .15s !important;
}
.stButton>button:hover{ background:#B8904A !important; }

/* Metrics */
[data-testid="stMetric"]{
  background:var(--bg-card) !important; border:var(--border) !important;
  border-radius:var(--radius) !important; padding:14px 16px !important;
}
[data-testid="stMetricLabel"]{ font-size:.72rem; color:var(--text-muted) !important; font-weight:600; letter-spacing:.5px; text-transform:uppercase; }
[data-testid="stMetricValue"]{ font-size:1.5rem; font-weight:800; color:var(--gold) !important; }
[data-testid="stMetricDelta"]{ color:var(--text-muted) !important; }

/* Expanders — fondo oscuro en header Y en contenido */
[data-testid="stExpander"]{
  border:var(--border) !important; border-radius:var(--radius) !important;
  background:var(--bg-card) !important; margin-bottom:8px !important;
}
[data-testid="stExpander"]:hover{ border-color:var(--gold) !important; }
[data-testid="stExpander"] summary{
  font-weight:700; font-size:.85rem; color:var(--text) !important;
  letter-spacing:.3px; padding:14px 16px;
  background:var(--bg-card) !important;
}
[data-testid="stExpander"] summary svg{ fill:var(--text-muted) !important; }
[data-testid="stExpander"] > div:last-child{
  background:var(--bg-card) !important;
  border-top:1px solid rgba(233,206,169,.08) !important;
}
[data-testid="stExpander"] p,
[data-testid="stExpander"] span,
[data-testid="stExpander"] div{
  color:var(--text) !important;
}

/* ── Formulario de diagnóstico ──────────────────────────────────────────────── */

/* accent-color global → controla slider, radio, checkbox nativos */
* { accent-color: #CEA970; }

/* Slider — override BaseWeb track fill (la barra roja de la izquierda) */
[data-testid="stSlider"] [role="slider"]{ background:#CEA970 !important; border-color:#CEA970 !important; }
[data-testid="stSlider"] div[data-baseweb="slider"] > div > div > div:nth-child(2) > div,
[data-testid="stSlider"] div[data-baseweb="slider"] > div > div > div > div:first-child{ background:#CEA970 !important; }
[data-testid="stSlider"] div[data-baseweb="slider"] > div > div > div:first-child{ background:rgba(206,169,112,.2) !important; }

/* Contenedor del form */
[data-testid="stForm"]{
  background:var(--bg-card) !important;
  border:var(--border) !important;
  border-radius:var(--radius) !important;
  padding:20px !important;
}

/* Labels de todos los widgets — muted uppercase pequeño */
.stTextInput label, .stTextArea label,
.stSelectbox label, .stSlider label, .stRadio label,
[data-testid="stWidgetLabel"]{
  color:var(--text-muted) !important;
  font-size:.72rem !important; font-weight:600 !important;
  letter-spacing:.5px !important; text-transform:uppercase !important;
}

/* Inputs de texto */
[data-testid="stTextInput"] input,
[data-testid="stTextArea"] textarea{
  background:var(--bg-card2) !important; color:var(--text) !important;
  border:1px solid rgba(233,206,169,.18) !important; border-radius:6px !important;
}
[data-testid="stTextInput"] input:focus,
[data-testid="stTextArea"] textarea:focus{
  border-color:var(--gold-dark) !important;
  outline:none !important; box-shadow:0 0 0 1px rgba(206,169,112,.3) !important;
}

/* Selectbox */
[data-testid="stSelectbox"] > div > div{
  background:var(--bg-card2) !important; color:var(--text) !important;
  border:1px solid rgba(233,206,169,.18) !important; border-radius:6px !important;
}
[data-testid="stSelectbox"] svg{ fill:var(--text-muted) !important; }
[data-baseweb="popover"] ul{ background:var(--bg-card2) !important; }
[data-baseweb="popover"] li{ color:var(--text) !important; }
[data-baseweb="popover"] li:hover{ background:var(--gold-dim) !important; }

/* Radio — label de la opción en texto blanco, no uppercase */
[data-testid="stRadio"] label span{ color:var(--text) !important; text-transform:none !important; font-size:.9rem !important; }

/* Botón submit — sin type="primary", toma nuestro estilo */
.stFormSubmitButton button{
  background:var(--gold-dark) !important; color:#FFFFFF !important;
  border:none !important; border-radius:6px !important;
  font-weight:800 !important; font-size:1rem !important;
  letter-spacing:1px !important; text-transform:uppercase !important;
  padding:16px !important; width:100% !important;
  transition:background .2s !important;
}
.stFormSubmitButton button:hover{ background:#B8904A !important; }

/* Progress bar */
[data-testid="stProgress"] > div > div{ background:var(--gold) !important; }

/* Alerts */
.stAlert{ border-radius:var(--radius) !important; background:var(--bg-card2) !important; border:var(--border) !important; }
.stSuccess{ border-left:3px solid var(--ride) !important; }
.stError{ border-left:3px solid var(--red) !important; }
.stWarning{ border-left:3px solid var(--gold) !important; }
.stInfo{ border-left:3px solid var(--gold-dark) !important; }

/* Dividers */
hr{ border-color:rgba(233,206,169,.1) !important; margin:16px 0 !important; }

/* Captions */
[data-testid="stCaptionContainer"]{ color:var(--text-muted) !important; }

/* Spinner */
[data-testid="stSpinner"]{ color:var(--gold) !important; }

/* Scrollbar */
::-webkit-scrollbar{ width:6px; }
::-webkit-scrollbar-track{ background:var(--bg); }
::-webkit-scrollbar-thumb{ background:rgba(233,206,169,.2); border-radius:3px; }
::-webkit-scrollbar-thumb:hover{ background:var(--gold-dim); }
</style>"""

st.markdown(GLOBAL_CSS, unsafe_allow_html=True)

CHART_LAYOUT = dict(
    font=dict(family="Hanken Grotesk, sans-serif", size=11, color="#9A9A9A"),
    plot_bgcolor="#111111", paper_bgcolor="#111111",
    margin=dict(l=0, r=0, t=10, b=0),
    xaxis=dict(showgrid=False, linecolor="rgba(233,206,169,.1)", tickfont=dict(size=10), color="#9A9A9A"),
    yaxis=dict(gridcolor="rgba(233,206,169,.06)", linecolor="rgba(233,206,169,.1)", tickfont=dict(size=10), color="#9A9A9A"),
)

# Dark-mode color tokens (used in inline HTML)
GOLD        = "#E9CEA9"
GOLD_DARK   = "#CEA970"
GOLD_DIM    = "rgba(233,206,169,.12)"
BG_CARD     = "#111111"
BG_CARD2    = "#1A1A1A"
TEXT        = "#FFFFFF"
TEXT_MUTED  = "#9A9A9A"
RUN_COLOR   = "#3B82F6"
RIDE_COLOR  = "#10B981"

# ── Helpers ────────────────────────────────────────────────────────────────────
@st.cache_data(ttl=60)
def load_json(path_str: str) -> dict | list | None:
    """OPT-4: Cached file read — re-reads disk at most once per minute."""
    path = Path(path_str)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def run_tool(script: str, label: str) -> tuple[bool, str]:
    python = str(ROOT / ".venv" / "bin" / "python")
    result = subprocess.run(
        [python, str(ROOT / "tools" / script)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if result.returncode != 0:
        return False, result.stderr or result.stdout
    return True, result.stdout


def fmt_duration(seconds: float) -> str:
    if not seconds:
        return "—"
    m = int(seconds) // 60
    return f"{m // 60}h {m % 60}min" if m >= 60 else f"{m} min"


def sun_wd(d: date) -> int:
    """Weekday position where Sunday=0, Monday=1, …, Saturday=6."""
    return (d.weekday() + 1) % 7


def week_range(d: date) -> tuple[date, date]:
    """Week starts on Sunday."""
    start = d - timedelta(days=sun_wd(d))
    return start, start + timedelta(days=6)


def iso_week_label(d: date) -> str:
    s, e = week_range(d)
    return f"{DAY_ES[sun_wd(s)]} {s.day} {MONTH_ES[s.month]} – {DAY_ES[sun_wd(e)]} {e.day} {MONTH_ES[e.month]}"


# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(f"""
<div style='padding:4px 4px 16px'>
  <div style='font-size:1.3rem;font-weight:800;color:{GOLD};letter-spacing:1px;text-transform:uppercase'>
    ⚡ Entrenador
  </div>
  <div style='margin-top:8px'>
    <span style='background:rgba(233,206,169,.12);color:{GOLD};font-size:.68rem;
                 font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.5px'>
      📍 BOGOTÁ · 2.600 M
    </span>
  </div>
</div>""", unsafe_allow_html=True)
    st.divider()

    # ── Botón actualizar — arriba para que siempre sea visible ───────────────
    if st.button("🔄 Actualizar plan", key="btn_update", type="primary"):
        steps = [
            ("fetch_garmin.py",    "Conectando a Garmin…"),
            ("generate_plan.py",   "Generando plan con IA…"),
            ("upload_workouts.py", "Subiendo workouts a Garmin…"),
        ]
        success = True
        progress = st.progress(0)
        for i, (script, label) in enumerate(steps):
            with st.spinner(label):
                ok, msg = run_tool(script, label)
                progress.progress((i + 1) / len(steps))
                if not ok:
                    st.error(f"Error en {script}:\n{msg}")
                    success = False
                    break
        if success:
            st.success("¡Plan actualizado!")
            st.rerun()

    st.divider()

    garmin = load_json(str(GARMIN_DATA))
    plan   = load_json(str(PLAN_DATA))

    if garmin:
        health = garmin.get("health", {})
        hrv_series = [h for h in health.get("hrv", []) if h.get("hrv")]
        rhr_series = [h for h in health.get("resting_hr", []) if h.get("resting_hr")]

        hrv_val = hrv_series[-1]["hrv"] if hrv_series else None
        rhr_val = rhr_series[-1]["resting_hr"] if rhr_series else None

        hrv_prev = hrv_series[-2]["hrv"] if len(hrv_series) >= 2 else hrv_val
        rhr_prev = rhr_series[-2]["resting_hr"] if len(rhr_series) >= 2 else rhr_val

        state = plan.get("athlete_state", "—") if plan else "—"
        state_cfg = {
            "fatigued":   ("#EF4444", "rgba(239,68,68,.15)",    "FATIGADO"),
            "balanced":   (GOLD,      "rgba(233,206,169,.12)",   "BALANCEADO"),
            "underloaded":("#10B981", "rgba(16,185,129,.15)",    "DESCARGADO"),
        }
        s_fg, s_bg, s_label = state_cfg.get(state, (TEXT_MUTED, BG_CARD2, state.upper()))

        col1, col2 = st.columns(2)
        col1.metric("HRV", f"{hrv_val}", f"{hrv_val - hrv_prev:+.0f}" if hrv_prev else None)
        col2.metric("FC reposo", f"{rhr_val}", f"{rhr_val - rhr_prev:+.0f}" if rhr_prev else None, delta_color="inverse")
        st.markdown(
            f"<div style='background:{s_bg};border:1px solid {s_fg}55;border-radius:6px;"
            f"padding:8px 14px;margin-top:8px;font-size:.75rem;font-weight:700;"
            f"color:{s_fg};letter-spacing:.8px;text-align:center'>{s_label}</div>",
            unsafe_allow_html=True,
        )
        st.caption(f"Actualizado: {garmin.get('extracted_at', '—')}")
    else:
        st.info("Sin datos de Garmin. Usa 'Actualizar plan' para comenzar.")


# ── Main tabs ──────────────────────────────────────────────────────────────────
tab_plan, tab_hist, tab_diag, tab_edu = st.tabs(["📅 Plan", "📊 Historial", "🩺 Diagnóstico", "📚 Aprende"])


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — PLAN COMPLETO (todas las semanas)
# ═══════════════════════════════════════════════════════════════════════════════
STRENGTH_DAYS = {2, 4}  # martes=2, jueves=4 (semana desde domingo)


def render_week_calendar(week_start: date, day_sessions: dict[int, list], today: date):
    """Render a 7-column weekly calendar. day_sessions: {sun_wd offset: [session_dicts]}"""
    cols = st.columns(7)
    for wd in range(7):           # wd: 0=Dom, 1=Lun, …, 6=Sáb
        d = week_start + timedelta(days=wd)
        sessions = day_sessions.get(wd, [])
        is_today = d == today
        is_strength = wd in STRENGTH_DAYS

        is_past    = d < today
        header_bg  = GOLD_DIM   if is_today else ("transparent" if is_past else "transparent")
        header_col = GOLD       if is_today else (TEXT_MUTED   if is_past else TEXT)
        header_bdr = f"border:1px solid {GOLD};" if is_today else f"border:1px solid rgba(233,206,169,.1);"
        past_op    = "opacity:.4;" if is_past else ""

        with cols[wd]:
            st.markdown(
                f"<div style='text-align:center;font-weight:700;background:{header_bg};"
                f"color:{header_col};border-radius:6px;padding:6px 2px;{header_bdr}{past_op}'>"
                f"<div style='font-size:.65rem;letter-spacing:.8px;text-transform:uppercase'>{DAY_ES[wd]}</div>"
                f"<div style='font-size:1.1rem;font-weight:800;line-height:1.3'>{d.day}</div></div>",
                unsafe_allow_html=True,
            )
            if is_strength:
                st.markdown(
                    f"<div style='background:rgba(233,206,169,.08);border:1px solid rgba(233,206,169,.15);"
                    f"border-radius:6px;padding:4px;margin-top:5px;text-align:center;"
                    f"font-size:.65rem;font-weight:700;color:{GOLD};letter-spacing:.5px;{past_op}'>💪 FUERZA</div>",
                    unsafe_allow_html=True,
                )
            for s in sessions:
                rationale_html = (
                    f"<details><summary style='cursor:pointer;font-size:.68rem;color:{TEXT_MUTED};"
                    f"margin-top:5px;letter-spacing:.3px'>¿Por qué?</summary>"
                    f"<p style='font-size:.68rem;color:{TEXT_MUTED};margin:4px 0 0;line-height:1.4'>{s['rationale']}</p></details>"
                    if s.get("rationale") else ""
                )
                dur_html = (
                    f"<div style='font-size:.7rem;color:{TEXT_MUTED};margin-top:3px'>{s['duration']} min</div>"
                    if s.get("duration") else ""
                )
                completed_style = f"text-decoration:line-through;color:{TEXT_MUTED};" if s.get("completed") else ""
                st.markdown(
                    f"<div style='background:{BG_CARD};border-left:3px solid {s['color']};"
                    f"border-radius:6px;padding:8px 10px;margin-top:6px;{past_op}'>"
                    f"<div style='font-size:.6rem;font-weight:700;color:{s['color']};"
                    f"letter-spacing:.8px;text-transform:uppercase'>{s['emoji']} {s['tag']}</div>"
                    f"<div style='font-size:.78rem;font-weight:600;color:{TEXT};margin-top:3px;"
                    f"{completed_style}'>{s['label']}</div>"
                    f"{dur_html}{rationale_html}</div>",
                    unsafe_allow_html=True,
                )
            if not sessions and not is_strength:
                st.markdown(
                    f"<div style='text-align:center;color:rgba(233,206,169,.2);margin-top:10px;{past_op}'>—</div>",
                    unsafe_allow_html=True,
                )


with tab_plan:
    if not garmin:
        st.info("No hay datos de Garmin. Usa el botón **Actualizar plan** en la barra lateral.")
        st.stop()

    today = date.today()

    # ── Collect all sessions across all sources ──────────────────────────────
    # {date_iso: [session_dict, ...]}
    all_sessions: dict[str, list] = {}

    def add_session(date_iso: str, s: dict):
        all_sessions.setdefault(date_iso, []).append(s)

    # Past activities (last 3 weeks)
    for a in garmin.get("activities_last_3_weeks", []):
        sport = a.get("type", "unknown")
        emoji = SPORT_EMOJI.get(sport, "⚡")
        dur = int((a.get("duration_sec") or 0) // 60) or None
        add_session(a["date"], {
            "label": a.get("name") or sport,
            "tag": "HECHO", "color": "#6B7280", "bg": "#1A1A1A",
            "emoji": emoji, "duration": dur, "completed": True,
        })

    # Runna scheduled (upcoming)
    for s in (plan or {}).get("runna_sessions", []):
        add_session(s["date"], {
            "label": s["name"], "tag": "RUNNA", "color": RUN_COLOR,
            "bg": BG_CARD, "emoji": "🏃",
        })

    # Cycling sessions added by the optimizer
    for s in (plan or {}).get("cycling_sessions", []):
        add_session(s["date"], {
            "label": s["name"], "tag": s.get("primary_zone", "Z1"), "color": RIDE_COLOR,
            "bg": BG_CARD, "emoji": "🚴",
            "duration": s.get("duration_min"), "rationale": s.get("rationale", ""),
        })

    # Determine full date range to display
    all_dates = sorted(all_sessions.keys())
    if not all_dates:
        st.info("Sin sesiones registradas o planificadas.")
        st.stop()

    first_date = date.fromisoformat(all_dates[0])
    last_date  = date.fromisoformat(all_dates[-1])
    # Extend to full Sunday-based week boundaries
    display_start = first_date - timedelta(days=sun_wd(first_date))
    display_end   = last_date + timedelta(days=6 - sun_wd(last_date))

    WEEK_TYPE_LABEL = {
        "recuperacion":    ("💧", "Recuperación"),
        "base_aerobica":   ("🌱", "Base Aeróbica"),
        "carga_moderada":  ("📈", "Carga Moderada"),
        "carga_alta":      ("🔥", "Carga Alta"),
        "descarga":        ("💧", "Descarga"),
        "pico":            ("⚡", "Pico"),
        "competencia":     ("🏁", "Competencia"),
    }
    weeks_plan_list: list[dict] = plan.get("weeks_plan", []) if plan else []

    def find_week_meta(ws: date, we: date) -> dict | None:
        """Find weeks_plan entry that overlaps with [ws, we] by date range."""
        for wp in weeks_plan_list:
            try:
                wp_start = date.fromisoformat(wp.get("week_start", ""))
                wp_end   = date.fromisoformat(wp.get("week_end",   ""))
                if ws <= wp_end and wp_start <= we:
                    return wp
            except ValueError:
                continue
        return None

    # ── Render week by week ──────────────────────────────────────────────────
    ws = display_start
    while ws <= display_end:
        we = ws + timedelta(days=6)
        is_current = ws <= today <= we
        is_future  = ws > today

        week_label = iso_week_label(ws)

        # Find macro purpose for this week (by date overlap, not exact key)
        meta = find_week_meta(ws, we)
        if meta:
            wtype = meta.get("week_type", "")
            emoji, type_label = WEEK_TYPE_LABEL.get(wtype, ("⚪", wtype.replace("_", " ").capitalize()))
            badge = f" · {emoji} {type_label}"
        elif is_current:
            badge = " · **semana actual**"
        elif we < today:
            badge = " · _pasada_"
        else:
            badge = ""

        # Build {sun_wd offset: [sessions]} for this week
        day_map: dict[int, list] = {}
        for offset in range(7):
            d = ws + timedelta(days=offset)
            for s in all_sessions.get(d.isoformat(), []):
                day_map.setdefault(sun_wd(d), []).append(s)

        with st.expander(f"**{week_label}**{badge}", expanded=is_current):

            # ── Week purpose banner ──────────────────────────────────────────
            if meta:
                wtype = meta.get("week_type", "")
                emoji, type_label = WEEK_TYPE_LABEL.get(wtype, ("⚪", wtype.capitalize()))
                st.markdown(
                    f"<div style='background:{BG_CARD};border-left:3px solid {GOLD};"
                    f"border-radius:8px;padding:14px 18px;margin-bottom:14px'>"
                    f"<span style='background:rgba(233,206,169,.15);color:{GOLD};font-size:.65rem;"
                    f"font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:.8px;"
                    f"text-transform:uppercase'>{emoji} {type_label}</span>"
                    f"<div style='margin-top:10px;font-size:.88rem;color:{TEXT};font-weight:500;"
                    f"line-height:1.55'>{meta.get('purpose','')}</div>"
                    f"<div style='margin-top:6px;font-size:.8rem;color:{TEXT_MUTED};line-height:1.4'>"
                    f"{meta.get('macro_context','')}</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

            render_week_calendar(ws, day_map, today)

            # ── Load analysis (planned weeks only) ──────────────────────────
            if plan and (is_current or is_future):
                la = plan.get("load_analysis", {})
                dist = la.get("estimated_zone_distribution", {})
                if dist and is_current:
                    st.divider()
                    c1, c2, c3, c4 = st.columns(4)
                    c1.metric("Z1 base aeróbica", f"{dist.get('Z1_pct','—')}%")
                    c2.metric("Z2 umbral", f"{dist.get('Z2_pct','—')}%")
                    c3.metric("Z3+ intensidad", f"{dist.get('Z3_pct','—')}%")
                    total_h = la.get("this_week_running_hours", 0) + la.get("this_week_cycling_hours_added", 0)
                    c4.metric("Volumen total", f"{total_h:.1f} h")

                if is_current:
                    rationale = plan.get("scientific_rationale", "")
                    if rationale:
                        with st.expander("📚 Base científica"):
                            st.markdown(rationale)

        ws += timedelta(days=7)


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — HISTORIAL
# ═══════════════════════════════════════════════════════════════════════════════
with tab_hist:
    if not garmin:
        st.info("Sin datos de Garmin todavía.")
        st.stop()

    activities = garmin.get("activities_last_3_weeks", [])
    health     = garmin.get("health", {})
    hrv_series = garmin.get("health", {}).get("hrv", [])
    rhr_series = garmin.get("health", {}).get("resting_hr", [])

    # ── HRV + RHR trend charts ───────────────────────────────────────────────
    col_hrv, col_rhr = st.columns(2)

    with col_hrv:
        st.markdown("<div style='font-size:.9rem;font-weight:600;color:#E9CEA9;margin-bottom:8px'>HRV — últimas 3 semanas</div>", unsafe_allow_html=True)
        hrv_data = [(h["date"], h["hrv"]) for h in hrv_series if h.get("hrv")]
        if hrv_data:
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=[d for d, _ in hrv_data],
                y=[v for _, v in hrv_data],
                mode="lines+markers",
                line=dict(color="#E9CEA9", width=2.5),
                marker=dict(size=5, color="#E9CEA9"),
                fill="tozeroy", fillcolor="rgba(26,86,219,.06)",
                name="HRV",
            ))
            fig.update_layout(height=200, yaxis_title="ms", **CHART_LAYOUT)
            st.plotly_chart(fig, use_container_width=True)

    with col_rhr:
        st.markdown("<div style='font-size:.9rem;font-weight:600;color:#E9CEA9;margin-bottom:8px'>FC reposo — últimas 3 semanas</div>", unsafe_allow_html=True)
        rhr_data = [(h["date"], h["resting_hr"]) for h in rhr_series if h.get("resting_hr")]
        if rhr_data:
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=[d for d, _ in rhr_data],
                y=[v for _, v in rhr_data],
                mode="lines+markers",
                line=dict(color="#E02424", width=2.5),
                marker=dict(size=5, color="#E02424"),
                fill="tozeroy", fillcolor="rgba(224,36,36,.06)",
                name="FC reposo",
            ))
            fig.update_layout(height=200, yaxis_title="bpm", **CHART_LAYOUT)
            st.plotly_chart(fig, use_container_width=True)

    st.divider()

    # ── Weekly summaries ─────────────────────────────────────────────────────
    st.markdown("<div style='font-size:.9rem;font-weight:600;color:#E9CEA9;margin-bottom:8px'>Resumen por semana</div>", unsafe_allow_html=True)

    if not activities:
        st.info("Sin actividades registradas en las últimas 3 semanas.")
    else:
        # Group by ISO week
        weeks: dict[str, list] = {}
        for a in activities:
            try:
                d = date.fromisoformat(a["date"])
            except ValueError:
                continue
            ws, _ = week_range(d)
            key = ws.isoformat()
            weeks.setdefault(key, []).append(a)

        for ws_iso in sorted(weeks.keys(), reverse=True):
            ws = date.fromisoformat(ws_iso)
            week_acts = weeks[ws_iso]
            label = iso_week_label(ws)

            runs  = [a for a in week_acts if "run"  in a.get("type", "")]
            rides = [a for a in week_acts if "cycl" in a.get("type", "")]

            run_sec  = sum(a.get("duration_sec", 0) or 0 for a in runs)
            ride_sec = sum(a.get("duration_sec", 0) or 0 for a in rides)
            total_sec = sum(a.get("duration_sec", 0) or 0 for a in week_acts)

            run_km  = sum((a.get("distance_m", 0) or 0) / 1000 for a in runs)
            ride_km = sum((a.get("distance_m", 0) or 0) / 1000 for a in rides)
            total_km = run_km + ride_km

            avg_hr_vals = [a["avg_hr"] for a in week_acts if a.get("avg_hr")]
            avg_hr = round(sum(avg_hr_vals) / len(avg_hr_vals)) if avg_hr_vals else None

            run_min  = int(run_sec  // 60)
            ride_min = int(ride_sec // 60)

            expander_label = (
                f"**{label}** — "
                f"🏃 {run_min} min · {run_km:.1f} km"
                + (f"  ·  🚴 {ride_min} min" if ride_min else "")
            )

            with st.expander(expander_label):
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("🏃 Running", f"{run_min} min")
                c2.metric("Km carrera", f"{run_km:.1f} km")
                c3.metric("🚴 Ciclismo", f"{ride_min} min" if ride_min else "—")
                c4.metric("Km bici", f"{ride_km:.1f} km" if ride_km else "—")
                c5.metric("FC media", f"{avg_hr} bpm" if avg_hr else "—")

                st.markdown("<div style='font-size:.8rem;font-weight:600;color:#E9CEA9;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.4px'>Sesiones</div>", unsafe_allow_html=True)
                for a in sorted(week_acts, key=lambda x: x["date"]):
                    d = date.fromisoformat(a["date"])
                    sport = a.get("type", "unknown")
                    emoji = SPORT_EMOJI.get(sport, "⚡")
                    dur = fmt_duration(a.get("duration_sec", 0))
                    km = f"{(a.get('distance_m') or 0)/1000:.1f} km" if a.get("distance_m") else ""
                    hr = f"FC {a['avg_hr']} bpm" if a.get("avg_hr") else ""
                    parts = " · ".join(filter(None, [dur, km, hr]))

                    st.markdown(
                        f"<div style='background:#1A1A1A;border:1px solid rgba(233,206,169,.1);border-radius:8px;"
                        f"padding:10px 14px;margin:4px 0;display:flex;align-items:flex-start;gap:10px'>"
                        f"<span style='font-size:1.3rem;line-height:1.2'>{emoji}</span>"
                        f"<div><div style='font-size:.85rem;font-weight:600;color:#FFFFFF'>"
                        f"{DAY_ES[sun_wd(d)]} {d.day} {MONTH_ES[d.month]} — {a.get('name', sport)}</div>"
                        f"<div style='font-size:.78rem;color:#9A9A9A;margin-top:2px'>{parts}</div></div></div>",
                        unsafe_allow_html=True,
                    )

    st.divider()

    # ── Volume bar chart ─────────────────────────────────────────────────────
    if activities:
        st.markdown("<div style='font-size:.9rem;font-weight:600;color:#E9CEA9;margin-bottom:8px'>Volumen semanal (minutos)</div>", unsafe_allow_html=True)
        week_mins: dict[str, float] = {}
        for a in activities:
            try:
                d = date.fromisoformat(a["date"])
            except ValueError:
                continue
            ws, _ = week_range(d)
            key = iso_week_label(ws)
            week_mins[key] = week_mins.get(key, 0) + (a.get("duration_sec", 0) or 0) / 60

        fig = go.Figure(go.Bar(
            x=list(week_mins.keys()),
            y=list(week_mins.values()),
            marker_color="#E9CEA9",
            marker_line_width=0,
            text=[f"{v:.0f}" for v in week_mins.values()],
            textposition="outside",
            textfont=dict(size=11, color="#9A9A9A"),
        ))
        fig.update_layout(height=240, yaxis_title="minutos", **CHART_LAYOUT)
        st.plotly_chart(fig, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 3 — DIAGNÓSTICO
# ═══════════════════════════════════════════════════════════════════════════════
with tab_diag:
    st.markdown("<div style='font-size:1.1rem;font-weight:700;color:#FFFFFF;margin-bottom:4px'>🩺 Evaluación de dolor o molestia</div>", unsafe_allow_html=True)
    st.markdown(
        "<div style='color:#FFFFFF;margin-bottom:8px'>"
        "Describe lo que sientes y el sistema ajustará el plan de ciclismo. "
        "Las sesiones de Runna <strong>nunca se modifican automáticamente</strong> — solo se emiten advertencias."
        "</div>",
        unsafe_allow_html=True,
    )

    # Show previous diagnosis if exists
    prev_diag = load_json(str(DIAGNOSIS))
    if prev_diag:
        with st.expander("Ver diagnóstico anterior", expanded=False):
            level = prev_diag.get("classification", "").upper()
            color = {"MINOR": "#FFF9C4", "MODERATE": "#FFE0B2", "SEVERE": "#FFCDD2"}.get(level, "#F5F5F5")
            emoji = {"MINOR": "🟡", "MODERATE": "🟠", "SEVERE": "🔴"}.get(level, "⚪")
            st.markdown(
                f"<div style='background:{color};padding:12px;border-radius:8px'>"
                f"<strong>{emoji} {level}</strong><br>{prev_diag.get('pain_summary', '')}</div>",
                unsafe_allow_html=True,
            )
            if prev_diag.get("general_advice"):
                st.info(prev_diag["general_advice"])
            if prev_diag.get("seek_professional_care"):
                st.warning("🏥 Se recomienda consultar a un médico deportivo.")

    st.divider()

    with st.form("diagnosis_form"):
        col_a, col_b = st.columns(2)
        with col_a:
            location = st.text_input("📍 ¿Dónde duele?", placeholder="ej. rodilla izquierda, tendón de Aquiles derecho")
            pain_type = st.selectbox("📋 Tipo de dolor", [
                "Selecciona…", "Dolor agudo / punzante", "Dolor sordo / molestia",
                "Ardor / sensación de quemadura", "Rigidez / tensión", "Inflamación",
            ])
            when_occurs = st.selectbox("⏱ ¿Cuándo aparece?", [
                "Selecciona…", "Durante el entrenamiento", "Después del entrenamiento",
                "En reposo", "Al despertar", "Todo el tiempo",
            ])
        with col_b:
            severity = st.slider("🔢 Severidad (1 = apenas perceptible · 10 = insoportable)", 1, 10, 3)
            duration_pain = st.text_input("📅 ¿Hace cuánto tienes esta molestia?", placeholder="ej. 2 días, desde ayer")
            swelling = st.radio("🔍 ¿Hay inflamación, enrojecimiento o moretón?", ["No", "Sí"], horizontal=True)

        extra = st.text_area("💬 Contexto adicional (opcional)", placeholder="ej. empeoró después del long run del domingo")
        submitted = st.form_submit_button("Analizar molestia", width="stretch")

    if submitted and location:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        research = RESEARCH_CTX.read_text(encoding="utf-8") if RESEARCH_CTX.exists() else ""
        garmin_ctx = json.dumps(load_json(str(GARMIN_DATA)) or {}, indent=2, ensure_ascii=False)
        plan_ctx   = json.dumps(load_json(str(PLAN_DATA)) or {}, indent=2, ensure_ascii=False)

        pain_desc = {
            "location": location, "severity": severity, "pain_type": pain_type,
            "when_occurs": when_occurs, "duration": duration_pain,
            "swelling": swelling, "additional_notes": extra,
        }

        system = f"""Eres un asesor de entrenamiento con conocimiento en medicina deportiva.
Un corredor que prepara un medio maratón en Bogotá (2.600 m) describe una molestia física.
Evalúala en el contexto de su plan de entrenamiento y recomienda ajustes conservadores.

CONTEXTO CIENTÍFICO (artículos revisados por pares):
{research[:25000]}

REGLAS ABSOLUTAS:
1. Las sesiones de Runna son SOLO LECTURA. No las modifiques. Solo emite advertencias si hay riesgo grave.
2. Máximo 1-2 sesiones de ciclismo por semana. Martes y jueves son días de fuerza — no hay ciclismo.
3. Ante la duda, recomienda menos carga, no más.
4. No diagnostiques condiciones médicas. Refiere a profesional si hay señales de alerta.

RESPONDE con un JSON válido con esta estructura exacta:
{{
  "pain_summary": "descripción clínica breve en español",
  "classification": "minor | moderate | severe",
  "classification_rationale": "por qué esta clasificación, en español",
  "cycling_adjustments": [{{"date":"YYYY-MM-DD","original_session":"string","adjusted_session":"string o REST","reason":"string en español"}}],
  "runna_warnings": [{{"date":"YYYY-MM-DD","session":"string","warning":"⚠️ RECOMENDACIÓN (solo informativa): string en español"}}],
  "return_to_full_load_estimate": "string en español",
  "general_advice": "2-3 oraciones de consejo en español",
  "seek_professional_care": true | false
}}"""

        user_msg = f"""Fecha: {date.today().isoformat()}
Altitud: Bogotá (~2.600 m)

MOLESTIA DESCRITA:
{json.dumps(pain_desc, indent=2, ensure_ascii=False)}

PLAN ACTUAL:
{plan_ctx[:3000]}

DATOS GARMIN (resumen):
Actividades recientes: {garmin_ctx[:1500]}

Evalúa y devuelve solo el JSON."""

        with st.spinner("Analizando con IA…"):
            try:
                client = anthropic.Anthropic(api_key=api_key)
                msg = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1500,
                    system=system,
                    messages=[{"role": "user", "content": user_msg}],
                )
                raw = msg.content[0].text.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                if raw.endswith("```"):
                    raw = raw[:raw.rfind("```")]
                diag = json.loads(raw.strip())

                # Save
                DIAGNOSIS.parent.mkdir(parents=True, exist_ok=True)
                DIAGNOSIS.write_text(json.dumps(diag, indent=2, ensure_ascii=False), encoding="utf-8")

                # Display result
                level = diag.get("classification", "").upper()
                level_cfg = {
                    "MINOR":    (GOLD,       GOLD_DIM,                        "🟡"),
                    "MODERATE": (GOLD_DARK,  "rgba(206,169,112,.15)",          "🟠"),
                    "SEVERE":   ("#EF4444",  "rgba(239,68,68,.15)",            "🔴"),
                }
                lv_color, lv_bg, lv_emoji = level_cfg.get(level, (TEXT_MUTED, BG_CARD2, "⚪"))

                st.markdown(
                    f"<div style='background:{lv_bg};border:1px solid {lv_color}44;"
                    f"border-left:4px solid {lv_color};border-radius:8px;padding:16px 20px;margin-top:12px'>"
                    f"<div style='font-size:.7rem;font-weight:700;color:{lv_color};"
                    f"letter-spacing:.8px;text-transform:uppercase'>{lv_emoji} {level}</div>"
                    f"<div style='font-size:.95rem;font-weight:700;color:{TEXT};margin:8px 0 4px'>"
                    f"{diag.get('pain_summary','')}</div>"
                    f"<div style='font-size:.85rem;color:{TEXT_MUTED};line-height:1.5'>"
                    f"{diag.get('classification_rationale','')}</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

                adjustments = diag.get("cycling_adjustments", [])
                if adjustments:
                    st.markdown(f"<div style='font-size:.75rem;font-weight:700;color:{GOLD};letter-spacing:.6px;text-transform:uppercase;margin:16px 0 8px'>Ajustes al ciclismo</div>", unsafe_allow_html=True)
                    for a in adjustments:
                        st.markdown(
                            f"<div style='border-left:3px solid {GOLD_DARK};background:{BG_CARD2};"
                            f"padding:10px 14px;border-radius:6px;margin:6px 0'>"
                            f"<div style='font-size:.78rem;font-weight:700;color:{GOLD}'>{a.get('date','')}</div>"
                            f"<div style='font-size:.85rem;color:{TEXT};margin:4px 0'>"
                            f"<s style='color:{TEXT_MUTED}'>{a.get('original_session','')}</s> → <strong>{a.get('adjusted_session','')}</strong></div>"
                            f"<div style='font-size:.78rem;color:{TEXT_MUTED}'>{a.get('reason','')}</div></div>",
                            unsafe_allow_html=True,
                        )

                warnings = diag.get("runna_warnings", [])
                if warnings:
                    st.markdown("#### Advertencias sobre sesiones Runna _(solo informativas)_")
                    for w in warnings:
                        st.warning(f"**{w.get('date','')} — {w.get('session','')}**\n\n{w.get('warning','')}")

                st.info(f"**Vuelta a carga completa:** {diag.get('return_to_full_load_estimate','—')}\n\n{diag.get('general_advice','')}")

                if diag.get("seek_professional_care"):
                    st.error("🏥 Se recomienda consultar a un médico deportivo antes de continuar entrenando con intensidad.")

            except json.JSONDecodeError as e:
                st.error(f"Error al parsear la respuesta de la IA: {e}")
            except Exception as e:
                st.error(f"Error al analizar: {e}")

    elif submitted and not location:
        st.warning("Por favor indica dónde sientes la molestia.")


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 4 — APRENDE
# ═══════════════════════════════════════════════════════════════════════════════
with tab_edu:
    import sys as _sys
    _sys.path.insert(0, str(ROOT / "context"))
    from education_insights import CATEGORIES

    st.markdown(
        "<div style='font-size:1rem;color:#9A9A9A;margin-bottom:24px'>"
        "Insights destilados de investigación científica reciente (2009–2025) "
        "sobre entrenamiento de resistencia, altitud, fuerza, recuperación y nutrición."
        "</div>",
        unsafe_allow_html=True,
    )

    for cat in CATEGORIES:
        # Category header — dark bg, accent border + text
        st.markdown(
            f"<div style='background:{BG_CARD};border-left:4px solid {cat['color']};"
            f"border-radius:8px;padding:14px 20px;margin-bottom:12px'>"
            f"<div style='font-size:1rem;font-weight:800;color:{cat['color']};"
            f"letter-spacing:.8px;text-transform:uppercase'>{cat['icon']} {cat['title']}</div>"
            f"<div style='font-size:.82rem;color:{TEXT_MUTED};margin-top:3px'>{cat['subtitle']}</div>"
            f"</div>",
            unsafe_allow_html=True,
        )

        cols_per_row = 2
        insights = cat["insights"]
        for row_start in range(0, len(insights), cols_per_row):
            row = insights[row_start:row_start + cols_per_row]
            cols = st.columns(len(row))
            for col, ins in zip(cols, row):
                with col:
                    st.markdown(
                        f"<div style='background:{BG_CARD};border:1px solid rgba(233,206,169,.1);"
                        f"border-radius:8px;padding:16px 18px;margin-bottom:12px;"
                        f"box-shadow:0 4px 16px rgba(0,0,0,.3)'>"
                        # Source pill
                        f"<div style='font-size:.65rem;font-weight:700;color:{cat['color']};"
                        f"text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px'>"
                        f"{cat['icon']} {ins['source']}</div>"
                        # Title
                        f"<div style='font-size:.92rem;font-weight:700;color:{TEXT};margin-bottom:8px;line-height:1.3'>"
                        f"{ins['title']}</div>"
                        # Finding
                        f"<div style='font-size:.8rem;color:{TEXT_MUTED};line-height:1.55;margin-bottom:10px'>"
                        f"{ins['finding']}</div>"
                        # Stat badge — dark bg, accent text
                        f"<div style='background:{BG_CARD2};border:1px solid {cat['color']}44;"
                        f"border-radius:6px;padding:7px 12px;margin-bottom:12px;"
                        f"font-size:.8rem;font-weight:800;color:{cat['color']};text-align:center;"
                        f"letter-spacing:.3px'>{ins['number']}</div>"
                        # Application
                        f"<div style='font-size:.78rem;color:{TEXT_MUTED};border-top:1px solid rgba(233,206,169,.08);"
                        f"padding-top:10px;line-height:1.55'>"
                        f"<span style='font-weight:700;color:{GOLD}'>¿Qué significa para ti?</span>"
                        f"<br><span style='color:#C0C0C0'>{ins['application']}</span></div>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )

        st.markdown("<div style='margin-bottom:8px'></div>", unsafe_allow_html=True)
