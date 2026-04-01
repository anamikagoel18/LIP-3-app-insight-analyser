import json
import os
import sys
import asyncio
import datetime
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import aiofiles
from dotenv import load_dotenv

# --- CRITICAL: Load environment variables BEFORE anything else ---
load_dotenv()

app = FastAPI(title="INDmoney Pulse API (FastAPI)")

# --- INSTANT HEALTH HEARTBEAT (Before Middlewares) ---
@app.get("/api/health")
async def health_check():
    """Ultra-lightweight heartbeat to pass container probes"""
    return {"status": "healthy", "timestamp": datetime.datetime.now().isoformat()}

@app.get("/")
async def root_redirect():
    return {"message": "INDmoney Pulse API is active.", "docs": "/docs"}

# --- STARTUP DIAGNOSTICS ---
print("="*50)
print(f"[STARTUP] TIME: {datetime.datetime.now().isoformat()}")
print(f"[STARTUP] PORT ENV: {os.getenv('PORT')}")
print(f"[STARTUP] DATA_DIR: {os.getenv('DATA_DIR')}")
print("="*50)

# --- MIDDLEWARE & CONFIG ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LAZY SERVICE INITIALIZATION ---
_analyzer = None
_email_service = None

def get_analyzer():
    global _analyzer
    if _analyzer is None:
        print("[LAZY] Initializing ReviewAnalyzer...")
        from .analysis import ReviewAnalyzer
        _analyzer = ReviewAnalyzer()
    return _analyzer

def get_email_service():
    global _email_service
    if _email_service is None:
        print("[LAZY] Initializing EmailService...")
        from .email_service import EmailService
        _email_service = EmailService()
    return _email_service

# --- HARDEN UTF-8 ENCODING ---
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, Exception):
    pass

# Base Paths (Environment Aware)
# Use Project Root as base
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Allow overriding data directory via env for persistent volumes (important for Docker/Render)
DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
REPORTS_DIR = os.getenv("REPORTS_DIR", os.path.join(BASE_DIR, "reports"))

# Ensure directories exist on startup to prevent crashes (important for cloud-native environments)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

PULSE_PATH = os.path.join(REPORTS_DIR, "weekly_pulse.json")
REPORT_PATH = os.path.join(REPORTS_DIR, "weekly_report.json")
REVIEWS_PATH = os.path.join(DATA_DIR, "processed_reviews.json")

# Global State
class SystemState:
    is_processing = False
    progress_label = ""

state = SystemState()

# Models
class TriggerRequest(BaseModel):
    limit: int
    days: Optional[int] = 0

class EmailRequest(BaseModel):
    email: str
    name: Optional[str] = ""

# --- HELPER FUNCTIONS ---

from .analysis import analyzer

def parse_date(date_str):
    """Robust parsing for various ISO-like formats from scrapers"""
    if not date_str:
        return datetime.datetime.min
    try:
        # Handle "2021-05-28T02:01:31.922Z"
        if date_str.endswith('Z'):
            date_str = date_str.replace('Z', '+00:00')
        return datetime.datetime.fromisoformat(date_str).replace(tzinfo=None)
    except:
        try:
            # Fallback for simpler formats
            return datetime.datetime.strptime(date_str[:10], "%Y-%m-%d")
        except:
            return datetime.datetime.min

async def run_pipeline(limit: int, days: int):
    state.is_processing = True
    state.progress_label = "Initializing..."
    
    try:
        # Phase 1 & 2: Data Ingestion & Processing (Existing Node.js scripts)
        pipeline_path = os.path.join(BASE_DIR, "adaptive_pipeline.js")
        print(f"[PIPELINE] Running Phase 1 & 2 via Node.js (Limit: {limit}, Days: {days})...")
        
        process = await asyncio.create_subprocess_exec(
            "node", pipeline_path, str(limit), str(days), "--skip-analysis",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=BASE_DIR
        )

        async def watch_stdout(stream):
            while True:
                line = await stream.readline()
                if not line:
                    break
                text = line.decode('utf-8', errors='replace').strip()
                print(f"[NODE-PIPELINE] {text}")
                
                if "Phase 1" in text: state.progress_label = "Fetching reviews..."
                if "Phase 2" in text: state.progress_label = "Processing data..."

        await asyncio.gather(watch_stdout(process.stdout))
        await process.wait()

        # Phase 3: Native Python Analysis
        state.progress_label = "Generating Intelligence (Python)..."
        
        if os.path.exists(REVIEWS_PATH):
            async with aiofiles.open(REVIEWS_PATH, mode='r', encoding='utf-8') as f:
                content = await f.read()
                raw_data = json.loads(content)
                reviews = raw_data if isinstance(raw_data, list) else raw_data.get("reviews", [])
                
                # 1. Apply 'days' filter to get the Relevant Source Pool
                source_reviews = reviews
                if days > 0:
                    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
                    source_reviews = [r for r in reviews if parse_date(r.get("date")) >= cutoff]
                
                source_total = len(source_reviews)
                
                # 2. Sort and Slice to requested limit for ACTUAL analysis
                source_reviews.sort(key=lambda x: parse_date(x.get("date")), reverse=True)
                target_reviews = source_reviews[:limit]
                
                # 3. Use Lazy Analyzer
                analyzer = get_analyzer()
                report, error_msg = await analyzer.run_analysis(target_reviews, limit=limit, days=days)
                
                if report:
                    print(f"[PIPELINE] Native Analysis Success. Analyzed {len(target_reviews)} of {source_total} relevant reviews.")
                else:
                    raise ValueError(error_msg or "Intelligence Generation Failure: LLM returned empty result.")
        
    except Exception as e:
        print(f"Pipeline Execution Failed: {str(e)}")
        # EMERGENCY METADATA SYNC: Update weekly_pulse.json with 'failed' status
        if os.path.exists(PULSE_PATH):
            try:
                with open(PULSE_PATH, 'r', encoding='utf-8') as f:
                    pulse = json.load(f)
                    pulse["analysis_status"] = "failed"
                    pulse["error_message"] = str(e)
                    pulse["review_limit"] = limit
                    pulse["time_range"] = days
                    pulse["timestamp"] = datetime.datetime.now().isoformat()
                with open(PULSE_PATH, 'w', encoding='utf-8') as f:
                    json.dump(pulse, f, indent=2)
            except:
                pass
    finally:
        state.is_processing = False
        state.progress_label = ""

# --- ENDPOINTS ---

@app.get("/api/pulse")
async def get_pulse():
    if not os.path.exists(PULSE_PATH):
        raise HTTPException(status_code=404, detail="Weekly Pulse not found.")
    async with aiofiles.open(PULSE_PATH, mode='r', encoding='utf-8') as f:
        content = await f.read()
        return json.loads(content)

@app.get("/api/report")
async def get_report():
    if not os.path.exists(REPORT_PATH):
        raise HTTPException(status_code=404, detail="Weekly Report not found.")
    async with aiofiles.open(REPORT_PATH, mode='r', encoding='utf-8') as f:
        content = await f.read()
        return json.loads(content)

@app.post("/api/trigger")
async def trigger_pipeline(req: TriggerRequest, background_tasks: BackgroundTasks):
    if state.is_processing:
        return {"status": "Already processing", "timestamp": datetime.datetime.now().isoformat()}
    
    background_tasks.add_task(run_pipeline, req.limit, req.days)
    return {"status": "Pipeline started.", "timestamp": datetime.datetime.now().isoformat()}

@app.get("/api/reviews")
async def get_reviews(limit: int = 75, days: int = 0):
    if not os.path.exists(REVIEWS_PATH):
        return []
    
    async with aiofiles.open(REVIEWS_PATH, mode='r', encoding='utf-8') as f:
        content = await f.read()
        raw_data = json.loads(content)
        reviews = raw_data if isinstance(raw_data, list) else raw_data.get("reviews", [])
        
        # Sort Chronologically (Latest First)
        reviews.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        # Filter by Days
        if days > 0:
            cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
            reviews = [r for r in reviews if parse_date(r.get("date")) >= cutoff]
        
        return reviews[:limit]

@app.get("/api/status")
async def get_status():
    metadata = {
        "status": "online",
        "isProcessing": state.is_processing,
        "progressLabel": state.progress_label,
        "timestamp": datetime.datetime.now().isoformat(),
        "reviewCount": 0,
        "lastAnalysisDate": "Never",
        "review_limit": 0,
        "time_range": 0
    }
    
    if os.path.exists(REVIEWS_PATH):
        async with aiofiles.open(REVIEWS_PATH, mode='r', encoding='utf-8') as f:
            content = await f.read()
            raw_data = json.loads(content)
            reviews = raw_data if isinstance(raw_data, list) else raw_data.get("reviews", [])
            metadata["reviewCount"] = len(reviews)
            
    if os.path.exists(PULSE_PATH):
        async with aiofiles.open(PULSE_PATH, mode='r', encoding='utf-8') as f:
            content = await f.read()
            pulse = json.loads(content)
            metadata["lastAnalysisDate"] = pulse.get("timestamp", "Never")
            metadata["review_limit"] = pulse.get("review_limit", 0)
            metadata["time_range"] = pulse.get("time_range", 0)
            
    return metadata

@app.post("/api/email")
async def send_email(req: EmailRequest, background_tasks: BackgroundTasks):
    if not req.email:
        raise HTTPException(status_code=400, detail="Recipient email is required.")
    
    # Use Lazy Email Service
    svc = get_email_service()
    background_tasks.add_task(svc.send_weekly_pulse, req.email, req.name)
    return {"message": f"Pulse delivery for {req.name or req.email} has been scheduled."}

@app.get("/api/test-email")
async def test_email():
    """Diagnostic endpoint to check SMTP connection"""
    svc = get_email_service()
    success, message = await svc.send_weekly_pulse(os.getenv("EMAIL_RECEIVER"), "Diagnostic Test")
    return {"success": success, "message": message, "smtp_user": os.getenv("SMTP_USER"), "smtp_host": os.getenv("SMTP_HOST")}

@app.post("/api/preview")
async def preview_email(req: EmailRequest):
    if not os.path.exists(PULSE_PATH):
        raise HTTPException(status_code=404, detail="Weekly Pulse not found. Please run analysis first.")
    
    async with aiofiles.open(PULSE_PATH, mode='r', encoding='utf-8') as f:
        content = await f.read()
        pulse_data = json.loads(content)
        svc = get_analyzer() # Wait, email service has the HTML generator
        svc = get_email_service()
        html = svc.get_pulse_html(pulse_data, req.name or "User")
        return {"html": html}

if __name__ == "__main__":
    import uvicorn
    # Railway provides the port via the PORT environment variable
    # Using os.environ.get is the most reliable way to capture it in Python
    raw_port = os.environ.get("PORT", "8080")
    port = int(raw_port)
    
    print("="*50)
    print(f"[STARTUP] BINDING TO HOST: 0.0.0.0")
    print(f"[STARTUP] BINDING TO PORT: {port}")
    print(f"[STARTUP] RECOGNIZED FROM ENV: {raw_port}")
    print("="*50)
    
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
