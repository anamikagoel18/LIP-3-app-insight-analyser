# --- VERSION: 2026-04-01-V9 (Index-Safe Architecture) ---
import streamlit as st
import os
import json
import asyncio
import time
import datetime
import pandas as pd
import sys
import traceback
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# --- PAGE CONFIG (Absolute Priority 1) ---
st.set_page_config(
    page_title="INDmoney Pulse | Intelligence Dashboard",
    page_icon="📊", layout="wide", initial_sidebar_state="expanded"
)

# --- GLOBAL WRAPPER TO CATCH ALL FAILURES ---
try:
    load_dotenv()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    if BASE_DIR not in sys.path:
        sys.path.append(BASE_DIR)

    from phase1_data_ingestion.native_fetcher import native_fetcher
    from phase2_processing.processor import processor
    from phase4_api.analysis import ReviewAnalyzer
    from phase4_api.email_service import EmailService

    # --- SAFE ENGINE LOADING ---
    @st.cache_resource
    def load_cached_engines_v9():
        try:
            return [ReviewAnalyzer(), EmailService()]
        except:
            return None

    # NO UNPACKING: Use Indexing
    _engines_list = load_cached_engines_v9()
    if isinstance(_engines_list, (list, tuple)) and len(_engines_list) == 2:
        analyzer_engine = _engines_list[0]
        email_service = _engines_list[1]
    else:
        analyzer_engine = None
        email_service = None

    # --- FAIL-SAFE ASYNC RUNNER ---
    def execute_async_v9(coro):
        """Absolute return guarantee: Never returns None."""
        try:
            _loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_loop)
            _res = _loop.run_until_complete(coro)
            _loop.close()
            # GUARANTEE: Must be a list of 2 items
            if _res is None or not isinstance(_res, (list, tuple)) or len(_res) < 2:
                return [False, "Process failed to return status."]
            return _res
        except Exception as _e:
            return [False, f"Runner Error: {str(_e)}"]

    # --- DASHBOARD LOGIC ---
    async def run_v9_pipeline(limit, days):
        st.session_state.is_processing = True
        try:
            # 1. Ingestion
            raw_data = native_fetcher.fetch_reviews(limit=limit, days=days)
            if not raw_data: return [False, "No signals found."]
            
            # 2. Processing
            processed = await asyncio.to_thread(processor.process, raw_data)
            
            # 3. AI Analysis
            if not analyzer_engine: return [False, "AI engine offline."]
            
            _ai_out = await analyzer_engine.run_analysis(processed[:limit], limit=limit, days=days)
            if isinstance(_ai_out, (list, tuple)) and len(_ai_out) >= 2:
                if _ai_out[0]: return [True, "Analysis Complete"]
                return [False, _ai_out[1] or "Analysis result empty"]
            
            return [False, "Engine Format Error"]
        except Exception as _pe:
            return [False, f"Fail: {str(_pe)}"]
        finally:
            st.session_state.is_processing = False

    # --- UI RENDERER (Shadow-Free & Index-Safe) ---
    st.title("Strategic Insight Dashboard")
    if 'is_processing' not in st.session_state: st.session_state.is_processing = False

    with st.sidebar:
        st.image("https://img.icons8.com/isometric/100/ffffff/area-chart.png", width=80)
        st.header("Intelligence Controls")
        
        _t_limit = st.slider("Limit", 50, 500, 100)
        _t_days = st.select_slider("Range", options=[7, 30, 90], value=30)
        
        if st.button("🚀 Analyze Signal") and not st.session_state.is_processing:
            _run = execute_async_v9(run_v9_pipeline(_t_limit, _t_days))
            if _run[0]: # Index 0 is Success
                st.success(_run[1]); time.sleep(1); st.rerun()
            else:
                st.error(_run[1]) # Index 1 is Message

    # Metrics Grid
    _P_PATH = os.path.join(BASE_DIR, "reports", "weekly_pulse.json")
    if os.path.exists(_P_PATH):
        with open(_P_PATH, 'r', encoding='utf-8') as _f:
            _p_data = json.load(_f)
        
        _grid = st.columns(3)
        if len(_grid) == 3:
            _grid[0].metric("Analyzed", _p_data.get('total_reviews', 0))
            _grid[1].metric("Theme", _p_data.get('top_themes', [{}])[0].get('name', 'N/A'))
            _grid[2].metric("Date", _p_data.get('timestamp', '')[:10])

        _tabs = st.tabs(["Pulse Brief", "Actions", "Raw Stream"])
        if len(_tabs) == 3:
            with _tabs[0]:
                st.subheader("Intelligence Themes")
                for _t in _p_data.get('top_themes', [])[:3]:
                    st.info(f"**{_t.get('name')}** ({_t.get('count', 0)} signals)")
            
            with _tabs[1]:
                st.subheader("Dispatch Center")
                _target = st.text_input("Stakeholder Email")
                if st.button("📬 Dispatch Pulse") and _target:
                    _d_res = execute_async_v9(email_service.send_weekly_pulse(_target, "Team"))
                    if _d_res[0]: st.success("Dispatch Sent");
                    else: st.error(_d_res[1])
            
            with _tabs[2]:
                _R_PATH = os.path.join(BASE_DIR, "data", "processed_reviews.json")
                if os.path.exists(_R_PATH):
                    with open(_R_PATH, 'r', encoding='utf-8') as _rf:
                        _rd = json.load(_rf).get('reviews', [])
                        if _rd: st.dataframe(pd.DataFrame(_rd).head(100), use_container_width=True)
    else:
        st.info("Awaiting initial pulse. Start analysis in the sidebar.")

except Exception as _critical:
    st.error("### 🛑 CRITICAL INDEX FAILURE")
    st.code(traceback.format_exc())
    st.warning("Please restart the dashboard server to clear corrupted session memory.")

st.markdown("---")
st.caption("INDmoney Pulse | Production V-9 (Index-Safe Architecture)")
