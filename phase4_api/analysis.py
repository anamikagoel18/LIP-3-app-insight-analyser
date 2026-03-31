import os
import json
import asyncio
import datetime
import sqlite3
from typing import List, Dict, Any, Optional
from groq import AsyncGroq
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

class ReviewAnalyzer:
    def __init__(self):
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        
        if not self.groq_key:
            print("[WARN] GROQ_API_KEY not found. Native analysis will require Gemini.")
        
        # Initialize Clients
        self.groq_client = AsyncGroq(api_key=self.groq_key) if self.groq_key else None
        
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.gemini_model = None
            print("[WARN] GEMINI_API_KEY not found. Fallback disabled.")
            
        self.groq_model = "llama-3.3-70b-versatile"
        
        # Base Paths
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.db_path = os.path.join(self.base_dir, "data", "pulse_data.db")
        self.report_path = os.path.join(self.base_dir, "reports", "weekly_report.json")
        self.pulse_path = os.path.join(self.base_dir, "reports", "weekly_pulse.json")

    def chunk_reviews(self, reviews: List[Dict], size: int = 50) -> List[List[Dict]]:
        return [reviews[i:i + size] for i in range(0, len(reviews), size)]

    async def analyze_batch(self, chunk: List[Dict], index: int) -> Optional[Dict[str, Any]]:
        print(f"[ANALYSIS] Extracting themes from Batch {index + 1} ({len(chunk)} reviews)...")
        
        review_texts = "\n".join([f"{i+1}. [Rating: {r.get('rating')}] {r.get('text') or r.get('content')}" for i, r in enumerate(chunk)])
        
        prompt = f"""
        Analyze these app reviews and return a JSON object with:
        1. 'themes': Top 5 primary themes (name, sentiment, count).
        2. 'quotes': 3 strongest VERBATIM representative quotes.
        3. 'problems': 3 most critical product problems found in these reviews.

        Reviews:
        {review_texts}

        Return ONLY a JSON object in this format:
        {{
          "themes": [{{ "name": "string", "sentiment": "string", "count": number }}],
          "quotes": ["string"],
          "problems": ["string"]
        }}
        """

        try:
            chat_completion = await self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                response_format={"type": "json_object"}
            )
            
            content = chat_completion.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            print(f"[ERROR] Groq Batch {index+1} failed: {str(e)}")
            return None

    async def run_analysis(self, reviews: List[Dict], limit: int = 100, days: int = 0) -> Optional[Dict[str, Any]]:
        if not reviews:
            print("[WARN] No reviews provided for analysis.")
            return None

        # PREVENT QUOTA EXHAUSTION: 
        target_reviews = reviews[:250] if len(reviews) > 250 else reviews
        
        # Metadata counts
        analyzed_count = len(target_reviews)
        source_total = len(reviews)
        
        print(f"[ANALYSIS] Starting Single-Pass for {analyzed_count} reviews (Total Source: {source_total})...")
        
        review_data = "\n".join([f"- [Rating: {r.get('rating')}] {r.get('text') or r.get('content')}" for r in target_reviews])
        
        prompt = f"""
        Generate a comprehensive Strategic Intelligence Report (Weekly Pulse) based on these {analyzed_count} app reviews.
        
        OUTPUT SECTIONS:
        1. Executive Briefing: A scannable summary of sentiment.
        2. Top 3 Themes: Clusters with 'name', 'status' (Improving/Critical/Neutral), and 'impact' (High/Medium/Low).
        3. 3 User Quotes: Verbatim anonymized quotes.
        4. 3 Strategic Actions: Technical or product improvement ideas.
        5. Draft Email: Complete email for stakeholders.
        
        REVIEWS:
        {review_data}
        
        Return ONLY a JSON object in this STRICTURE format:
        {{
          "summary": "string",
          "top_themes": [{{ "theme": "string", "status": "string", "impact": "string" }}],
          "weekly_pulse": {{
            "total_reviews": {analyzed_count},
            "top_themes": [{{ "name": "string", "description": "string", "count": number }}],
            "quotes": ["string"],
            "action_ideas": ["string"],
            "summary": "string",
            "draft_email": "string"
          }}
        }}
        """

        try:
            try:
                # --- TRY PRIMARY (GROQ) ---
                if not self.groq_client:
                    raise ValueError("Groq client not initialized.")
                    
                print(f"[ANALYSIS] Sending Single-Pass to Primary Engine (Groq)...")
                completion = await self.groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=self.groq_model,
                    response_format={"type": "json_object"}
                )
                report_content = completion.choices[0].message.content
                final_report = json.loads(report_content)
                engine_name = "Groq (Llama 3.3)"
                
            except Exception as groq_err:
                print(f"[WARN] Groq Primary Failed: {str(groq_err)}. Falling back to Gemini...")
                
                if not self.gemini_model:
                    raise ValueError("Gemini fallback not available (key missing).")
                
                # --- FALLBACK (GEMINI) ---
                print(f"[ANALYSIS] Sending Single-Pass to Fallback Engine (Gemini 1.5 Flash)...")
                gemini_response = self.gemini_model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                final_report = json.loads(gemini_response.text)
                engine_name = "Gemini (1.5 Flash)"

            # 4. Persistence
            await self.save_results(final_report, analyzed_count, source_total, limit, days, engine=engine_name)
            
            print(f"[ANALYSIS] Intelligence Success ({engine_name}).")
            return final_report
            
        except Exception as e:
            print(f"[ERROR] Dual-Engine Analysis Failed: {str(e)}")
            return None

    async def save_results(self, report: Dict[str, Any], analyzed_count: int, source_total: int, limit: int, days: int, engine: str = "Unknown"):
        # 1. Save JSON files
        os.makedirs(os.path.dirname(self.report_path), exist_ok=True)
        
        timestamp = datetime.datetime.now().isoformat()
        report["metadata"] = {
            "total_reviews": analyzed_count, # The primary count shown to user
            "total_source_found": source_total, # The context/pool count
            "review_limit": limit,
            "time_range": days,
            "engine": engine,
            "analysis_date": timestamp
        }
        
        if "weekly_pulse" in report:
            pulse = report["weekly_pulse"]
            pulse["timestamp"] = timestamp
            # Standardize for frontend display
            pulse["total_reviews"] = analyzed_count
            pulse["total_source_found"] = source_total
            pulse["review_limit"] = limit
            pulse["time_range"] = days
            pulse["analysis_status"] = 'success'
            pulse["engine"] = engine
            
            with open(self.pulse_path, 'w', encoding='utf-8') as f:
                json.dump(pulse, f, indent=2)
                
            # 2. Persistence to SQLite
            self.save_to_db(pulse)

        with open(self.report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)

    def save_to_db(self, pulse: Dict[str, Any]):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Ensure table exists (though db.js should have created it)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS pulse_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    total_reviews INTEGER NOT NULL,
                    review_limit INTEGER,
                    time_range INTEGER,
                    report_json TEXT NOT NULL
                )
            ''')
            
            cursor.execute('''
                INSERT INTO pulse_reports (timestamp, total_reviews, review_limit, time_range, report_json)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                pulse.get("timestamp", datetime.datetime.now().isoformat()),
                pulse.get("total_reviews", 0),
                pulse.get("review_limit", 0),
                pulse.get("time_range", 0),
                json.dumps(pulse)
            ))
            
            conn.commit()
            conn.close()
            print("[DATABASE] Pulse report persisted to SQLite successfully.")
        except Exception as e:
            print(f"[ERROR] SQLite Persistence Failed: {str(e)}")

# Singleton instance
analyzer = ReviewAnalyzer()
