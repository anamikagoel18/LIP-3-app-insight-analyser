# --- VERSION: 2026-04-01-V10 (Structured UI Complete) ---
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

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="INDmoney Pulse | Intelligence Dashboard",
    page_icon="📊", layout="wide", initial_sidebar_state="expanded"
)

# --- GLOBAL WRAPPER ---
try:
    load_dotenv()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    if BASE_DIR not in sys.path: sys.path.append(BASE_DIR)

    from phase1_data_ingestion.native_fetcher import native_fetcher
    from phase2_processing.processor import processor
    from phase4_api.analysis import ReviewAnalyzer
    from phase4_api.email_service import EmailService

    @st.cache_resource
    def load_engines():
        try: return [ReviewAnalyzer(), EmailService()]
        except: return None

    @st.cache_data(ttl=3600)
    def fetch_reviews_cached(limit, days):
        return native_fetcher.fetch_reviews(limit=limit, days=days)

    _engines = load_engines()
    analyzer_engine = _engines[0] if _engines else None
    email_service = _engines[1] if _engines else None

    def run_async(coro):
        try:
            _loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_loop)
            _res = _loop.run_until_complete(coro)
            _loop.close()
            return _res if isinstance(_res, (list, tuple)) else [False, "Err"]
        except Exception as _e: return [False, str(_e)]

    async def pipeline_task(limit, days, status_placeholder, force=False):
        st.session_state.is_processing = True
        if force:
            st.cache_data.clear()
            
        try:
            # Using new st.status for premium progress tracking
            with status_placeholder.status(f"Processing Pulse Analysis...", expanded=True) as status:
                status.write(f"📊 **Preparing to analyze {limit} reviews ({days}-day window)...**")
                
                # Step 1: Fetch
                status.write("📡 **Connecting to Google Play Store...**")
                raw = await asyncio.to_thread(fetch_reviews_cached, limit, days)
                
                if not raw: 
                    status.update(label="No Data Found", state="error")
                    return [False, f"No reviews found in the past {days} days. Try increasing the 'Range' slider."]
                
                status.write(f"📂 **Retrieval Complete.** Processing {len(raw)} raw reviews...")
                proc = await asyncio.to_thread(processor.process, raw)
                if not proc:
                    status.update(label="Processing Failed", state="error")
                    return [False, f"Found {len(raw)} raw reviews, but none were descriptive enough for analysis."]
                
                # Step 2: Analyze
                if not analyzer_engine: 
                    status.update(label="AI Engine Error", state="error")
                    return [False, "AI Engine Offline. Check environment variables."]
                
                target_count = len(proc[:limit])
                status.write(f"🧠 **Synthesizing {target_count} signals with AI...**")
                
                # FIX: Catch actual error message from the analyzer
                res, err = await analyzer_engine.run_analysis(proc[:limit], limit=limit, days=days)
                
                if res and not err:
                    status.update(label="Analysis Complete!", state="complete", expanded=False)
                    return [True, "Success"]
                else:
                    status.update(label="Intelligence Failed", state="error")
                    return [False, err or "Intelligence result returned empty."]
        except Exception as _e: 
            return [False, str(_e)]
        finally: 
            st.session_state.is_processing = False

    # --- UI RENDERER ---
    st.title("Strategic Insight Dashboard")
    
    with st.sidebar:
        st.header("Controls")
        if 'is_processing' not in st.session_state: st.session_state.is_processing = False
        # Sliders
        _lim = st.slider("Review Limit", 50, 500, 100)
        _days = st.select_slider("Time Window (Days)", options=[7, 30, 90], value=30)
        
        # Cache Control
        _force = st.checkbox("🔄 Force Fresh Fetch", help="Bypass local cache and query Play Store for live data.")
        
        # Sync Status Logic
        needs_update = False
        if os.path.exists(P_PATH):
            with open(P_PATH, 'r') as f:
                try:
                    c_rep = json.load(f)
                    if _lim != c_rep.get("review_limit", 100) or _days != c_rep.get("time_range", 30):
                        needs_update = True
                        st.warning("⚠️ **Selection Changed** - Hit Analyze Signal to refresh.")
                except: pass

        col1, col2 = st.columns([4, 1])
        with col1:
            btn_analyze = st.button(
                "🚀 Analyze Signal", 
                use_container_width=True, 
                disabled=st.session_state.is_processing,
                type="primary" if needs_update else "secondary"
            )
        with col2:
            if st.button("🧹", help="Clear Cache"):
                st.cache_data.clear()
                st.toast("Cache Cleared!")

        status_p = st.empty()
        
        if btn_analyze:
            _r = run_async(pipeline_task(_lim, _days, status_p, force=_force))
            if _r[0]: 
                st.success("Complete!")
                time.sleep(0.5)
                st.rerun()
            else: 
                st.error(_r[1])

    # --- CONTENT ---
    P_PATH = os.path.join(BASE_DIR, "reports", "weekly_pulse.json")
    R_PATH = os.path.join(BASE_DIR, "data", "processed_reviews.json")

    if os.path.exists(P_PATH):
        with open(P_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Tabs
        t1, t2, t3, t4 = st.tabs(["📊 Pulse Brief", "🎯 Strategic Actions", "📡 Raw Stream", "📧 Email Pulse"])
        
        with t1:
            st.markdown(f"### Weekly Intelligence Brief")
            
            # CLEAR METADATA DISPLAY
            gen_time = data.get('timestamp', 'Unknown')
            if 'T' in gen_time:
                date_str = gen_time.split('T')[0]
                time_str = gen_time.split('T')[1][:5]
                st.caption(f"📊 **Data Context:** {data.get('total_reviews', 0)} reviews ({data.get('time_range', 30)} days) | 🕒 **Analyzed:** {date_str} at {time_str}")
            else:
                st.caption(f"Synthesized from {data.get('total_reviews', 0)} reviews | {gen_time}")
            
            # Themes (Top 3)
            st.markdown("#### 🔍 Core Signals")
            cols = st.columns(3)
            for i, theme in enumerate(data.get('top_themes', [])[:3]):
                with cols[i]:
                    st.info(f"**{theme.get('name')}**\n\n{theme.get('description', '')[:100]}...")
            
            # Quotes (3)
            st.markdown("#### 🎙️ Verbatim Voice")
            for quote in data.get('quotes', [])[:3]:
                st.markdown(f"> *\"{quote}\"*")
            
            # Action Highlights
            st.markdown("#### ⚡ Quick Actions")
            for action in data.get('action_ideas', [])[:3]:
                task_text = action.get('task') if isinstance(action, dict) else action
                st.markdown(f"- {task_text}")

        with t2:
            st.subheader("Strategic Action Planner")
            for action in data.get('action_ideas', []):
                if isinstance(action, dict):
                    p = action.get('priority', 'Medium')
                    color = "#ef4444" if p == "High" else "#f59e0b" if p == "Medium" else "#3b82f6"
                    st.markdown(f"""
                    <div style="padding:15px; border-radius:10px; border-left: 5px solid {color}; background-color:rgba(255,255,255,0.05); margin-bottom:10px;">
                        <span style="background-color:{color}; color:white; padding:2px 8px; border-radius:5px; font-size:10px; font-weight:bold;">{p.upper()}</span>
                        <span style="color:#94a3b8; font-size:12px; margin-left:10px;">Theme: {action.get('theme', 'General')}</span>
                        <p style="margin-top:10px; font-weight:500;">{action.get('task')}</p>
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    st.markdown(f"- {action}")

        with t3:
            st.subheader("Signal Feed")
            all_rd = data.get('reviews', [])
            
            if all_rd:
                # Filters
                f_cols = st.columns(2)
                with f_cols[0]:
                    rating_filter = st.multiselect("Rating", [1,2,3,4,5], default=[1,2,3,4,5])
                with f_cols[1]:
                    # Dynamic theme keywords
                    theme_options = ["All"] + [t.get('name') for t in data.get('top_themes', [])]
                    theme_filter = st.selectbox("Filter by Theme", theme_options)
                
                # Filter Logic
                filtered_df = pd.DataFrame(all_rd)
                if not filtered_df.empty:
                    # Align with Processor.py schema (date, rating, text)
                    date_col = 'date' if 'date' in filtered_df.columns else 'at'
                    rating_col = 'rating' if 'rating' in filtered_df.columns else 'score'
                    content_col = 'text' if 'text' in filtered_df.columns else 'content'

                    if date_col in filtered_df.columns:
                        filtered_df['Date'] = pd.to_datetime(filtered_df[date_col]).dt.strftime('%Y-%m-%d')
                    else:
                        filtered_df['Date'] = "N/A"

                    # Apply Filter
                    if rating_col in filtered_df.columns:
                        filtered_df = filtered_df[filtered_df[rating_col].isin(rating_filter)]
                    
                    if theme_filter != "All":
                        # SEMANTIC FILTRATION: Use AI-assigned theme category if available, fallback to text search
                        if 'theme' in filtered_df.columns and filtered_df['theme'].notna().any():
                            filtered_df = filtered_df[
                                (filtered_df['theme'] == theme_filter) | 
                                (filtered_df[content_col].str.contains(theme_filter, case=False, na=False))
                            ]
                        elif content_col in filtered_df.columns:
                            filtered_df = filtered_df[filtered_df[content_col].str.contains(theme_filter, case=False, na=False)]
                    
                    # Select and rename for display
                    display_cols = ['Date']
                    rename_dict = {}
                    
                    if rating_col in filtered_df.columns:
                        display_cols.append(rating_col)
                        rename_dict[rating_col] = 'Rating'
                    if content_col in filtered_df.columns:
                        display_cols.append(content_col)
                        rename_dict[content_col] = 'Review'

                    st.dataframe(
                        filtered_df[display_cols].rename(columns=rename_dict),
                        use_container_width=True,
                        hide_index=True
                    )
            else:
                st.info("No reviews found in this pulse report. Analysis might have been filtered or data is missing.")

        with t4:
            st.subheader("Email Strategy Pulse")
            st.markdown("Generate and deliver a professional intelligence report to your inbox.")
            
            e_col1, e_col2 = st.columns([2, 1])
            with e_col1:
                recipient = st.text_input("Recipient Email", value=os.getenv("EMAIL_RECEIVER", ""), placeholder="ceo@company.com")
            with e_col2:
                r_name = st.text_input("Recipient Name", value="Executive", placeholder="Name")
            
            if st.button("🚀 Generate & Send Pulse Email", use_container_width=True):
                if not recipient:
                    st.error("Please enter a recipient email.")
                else:
                    with st.spinner("📦 Packaging Intelligence..."):
                        # We use run_async but EmailService's send_weekly_pulse is async
                        # Since email_service is already initialized globally:
                        success, msg = run_async(email_service.send_weekly_pulse(recipient, r_name))
                        if success:
                            st.success(f"Email delivered to {recipient}!")
                            st.balloons()
                        else:
                            st.error(f"Delivery Failed: {msg}")

            st.divider()
            st.caption("Preview Mode")
            if st.checkbox("Show Email Preview Template"):
                st.info("The email will follow the standard INDmoney Pulse HTML branding including the top 3 themes, quotes, and action ideas.")
                preview_html = email_service.get_pulse_html(data, r_name or "Manager")
                st.components.v1.html(preview_html, height=600, scrolling=True)

    else:
        st.info("No Pulse data found. Use sidebar to analyze.")

except Exception as _ce:
    st.error("### 🛑 CRITICAL FAILURE")
    st.code(traceback.format_exc())

st.markdown("---")
st.caption("INDmoney Pulse | Standalone Python Edition V-10")
