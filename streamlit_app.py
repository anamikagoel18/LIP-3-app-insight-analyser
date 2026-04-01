import streamlit as st
import os
import json
import asyncio
import time
import datetime
import pandas as pd
import subprocess
import sys
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="INDmoney Pulse | Intelligence Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- CLOUD STARTUP AUTOMATION (NPM INSTALL) ---
def ensure_node_dependencies():
    """Check for node_modules and run npm install if in cloud or missing."""
    if not os.path.exists("node_modules"):
        with st.spinner("📦 Initializing Cloud Environment (Installing Node.js Dependencies)..."):
            try:
                # Use --no-audit and --no-fund for speed in cloud builds
                subprocess.run(["npm", "install", "--no-audit", "--no-fund"], check=True)
                st.toast("✅ Node.js environment ready!", icon="🚀")
            except Exception as e:
                st.error(f"Failed to install Node.js dependencies: {e}")

# Run once per session
if 'npm_ready' not in st.session_state:
    ensure_node_dependencies()
    st.session_state.npm_ready = True

# --- CONFIG & SECRETS HANDLING ---
load_dotenv()

def get_secret(key: str, default: str = None) -> str:
    """Fallback from st.secrets (Cloud) to os.getenv (Local)."""
    if key in st.secrets:
        return st.secrets[key]
    return os.getenv(key, default)

# --- ENGINE IMPORTS & INITIALIZATION ---
# Add project root to sys.path to allow relative imports from phase4_api
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# Importing the engines from our existing architecture
from phase4_api.analysis import ReviewAnalyzer
from phase4_api.email_service import EmailService

@st.cache_resource
def get_engines():
    """Initialize and cache the intelligence engines."""
    return ReviewAnalyzer(), EmailService()

analyzer_engine, email_service = get_engines()

# --- STATE MANAGEMENT ---
if 'is_processing' not in st.session_state:
    st.session_state.is_processing = False
if 'progress_label' not in st.session_state:
    st.session_state.progress_label = ""

# --- PATHS ---
DATA_DIR = os.path.join(BASE_DIR, "data")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
PULSE_PATH = os.path.join(REPORTS_DIR, "weekly_pulse.json")
REVIEWS_PATH = os.path.join(DATA_DIR, "processed_reviews.json")

# --- CORE LOGIC PORTED FROM FASTAPI ---
def parse_date(date_str):
    if not date_str: return datetime.datetime.min
    try:
        if date_str.endswith('Z'): date_str = date_str.replace('Z', '+00:00')
        return datetime.datetime.fromisoformat(date_str).replace(tzinfo=None)
    except:
        try: return datetime.datetime.strptime(date_str[:10], "%Y-%m-%d")
        except: return datetime.datetime.min

async def run_standalone_pipeline(limit: int, days: int):
    st.session_state.is_processing = True
    st.session_state.progress_label = "Initializing Pipeline..."
    
    try:
        # Phase 1 & 2: Ingestion (JS)
        st.session_state.progress_label = "Fetching Play Store reviews..."
        pipeline_path = os.path.join(BASE_DIR, "adaptive_pipeline.js")
        
        process = await asyncio.create_subprocess_exec(
            "node", pipeline_path, str(limit), str(days), "--skip-analysis",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=BASE_DIR
        )
        await process.wait()

        # Phase 3: Analysis (Python)
        st.session_state.progress_label = "Synthesizing Intelligence..."
        if os.path.exists(REVIEWS_PATH):
            with open(REVIEWS_PATH, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)
                reviews = raw_data if isinstance(raw_data, list) else raw_data.get("reviews", [])
                
                # Context Slicing
                if days > 0:
                    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
                    reviews = [r for r in reviews if parse_date(r.get("date")) >= cutoff]
                
                reviews.sort(key=lambda x: parse_date(x.get("date")), reverse=True)
                target_reviews = reviews[:limit]
                
                # Run Analysis
                report, error = await analyzer_engine.run_analysis(target_reviews, limit=limit, days=days)
                if report:
                    return True, "Analysis Complete!"
                return False, error or "Analysis Failed"
    except Exception as e:
        return False, str(e)
    finally:
        st.session_state.is_processing = False
        st.session_state.progress_label = ""

# --- UI STYLING ---
st.markdown("""
    <style>
    .main { background-color: #0f172a; }
    .stApp { background-color: #0f172a; color: #f8fafc; }
    .stTabs [data-baseweb="tab-list"] { gap: 24px; background-color: #1e293b; padding: 10px 20px; border-radius: 12px; }
    .theme-card { background: #1e293b; padding: 20px; border-radius: 12px; border-left: 5px solid #3b82f6; margin-bottom: 12px; }
    .metric-card { background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 10px; border: 1px solid rgba(59, 130, 246, 0.2); }
    </style>
""", unsafe_allow_html=True)

# --- SIDEBAR ---
with st.sidebar:
    st.image("https://img.icons8.com/isometric/100/ffffff/area-chart.png", width=80)
    st.title("INDmoney Pulse")
    st.subheader("Intelligence Center")
    st.markdown("---")

    if st.session_state.is_processing:
        st.warning(f"⚡ {st.session_state.progress_label}")
        st.spinner()
    else:
        st.success("✨ Engine Ready")
        
    if os.path.exists(REVIEWS_PATH):
        with open(REVIEWS_PATH, 'r') as f:
            count = len(json.load(f))
            st.metric("Reviews Indexed", count)

    st.markdown("---")
    st.subheader("Trigger Analysis")
    limit = st.slider("Review Limit", 50, 500, 100)
    days = st.select_slider("Time Range", options=[0, 7, 30, 90], value=30, 
                           format_func=lambda x: "All Time" if x == 0 else f"{x} Days")
    
    if st.button("🚀 Run Standalone Pipeline") and not st.session_state.is_processing:
        success, msg = asyncio.run(run_standalone_pipeline(limit, days))
        if success:
            st.success(msg)
            time.sleep(1)
            st.rerun()
        else:
            st.error(msg)

# --- MAIN DASHBOARD ---
st.title("Strategic Insight Dashboard")

if os.path.exists(PULSE_PATH):
    with open(PULSE_PATH, 'r') as f:
        pulse_data = json.load(f)

    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown(f"<div class='metric-card'><h4>Analyzed</h4><h2>{pulse_data.get('total_reviews', 0)}</h2></div>", unsafe_allow_html=True)
    with col2:
        st.markdown(f"<div class='metric-card'><h4>Primary Theme</h4><h2>{pulse_data.get('top_themes', [{}])[0].get('name', 'N/A')}</h2></div>", unsafe_allow_html=True)
    with col3:
        st.markdown(f"<div class='metric-card'><h4>Synthesis Date</h4><p>{pulse_data.get('timestamp', '')[:16]}</p></div>", unsafe_allow_html=True)

    tab1, tab2, tab3 = st.tabs(["Weekly Pulse", "Strategic Actions", "Review Feed"])

    with tab1:
        st.subheader("Intelligence Clusters")
        cols = st.columns(3)
        for i, theme in enumerate(pulse_data.get('top_themes', [])[:3]):
            with cols[i]:
                st.markdown(f"<div class='theme-card' style='border-left-color: {['#3b82f6', '#a855f7', '#f97316'][i]}'><h4>{theme.get('name')}</h4><p>{theme.get('count', 0)} Signals Detected</p></div>", unsafe_allow_html=True)
        
        st.markdown("---")
        st.subheader("Verbatim User Voice")
        for quote in pulse_data.get('quotes', [])[:3]:
            st.info(f'"{quote}"')

    with tab2:
        st.subheader("Product Strategy Ideas")
        for action in pulse_data.get('action_ideas', []):
            st.markdown(f"✦ {action}")
        
        st.markdown("---")
        st.subheader("Email Dispatch")
        email_to = st.text_input("Recipient Address", placeholder="leads@indmoney.com")
        if st.button("📬 Dispatch Pulse Report") and email_to:
            with st.spinner("Delivering..."):
                success, msg = asyncio.run(email_service.send_weekly_pulse(email_to, "Team"))
                if success: st.success("Report delivered successfully!")
                else: st.error(msg)

    with tab3:
        st.subheader("Review Data Stream")
        if os.path.exists(REVIEWS_PATH):
            with open(REVIEWS_PATH, 'r') as f:
                df = pd.DataFrame(json.load(f))
                st.dataframe(df[["rating", "text", "date"]].head(100), use_container_width=True)

else:
    st.info("No Weekly Pulse found in this environment. Run the pipeline from the sidebar to begin.")

st.markdown("---")
st.caption("INDmoney Pulse | Deployment: Standalone (Streamlit Cloud Optimized)")
