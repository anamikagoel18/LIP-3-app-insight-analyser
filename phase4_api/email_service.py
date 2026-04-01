import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

class EmailService:
    def __init__(self):
        # Case-insensitive lookup for SMTP variables
        self.smtp_host = os.getenv("SMTP_HOST") or os.getenv("smtp_host") or "smtp.gmail.com"
        
        raw_port = (os.getenv("SMTP_PORT") or os.getenv("smtp_port") or "587").strip()
        try:
            self.smtp_port = int(raw_port) if raw_port else 587
        except ValueError:
            self.smtp_port = 587
            
        self.smtp_user = os.getenv("SMTP_USER") or os.getenv("smtp_user")
        self.smtp_pass = os.getenv("SMTP_PASS") or os.getenv("smtp_pass")
        self.sender_label = "INDMONEY Pulse"

    def get_pulse_html(self, pulse_data, name="User"):
        # Branded HTML Template Ported from JS
        html_content = f"""
        <div style="background-color: #020617; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #f8fafc; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto;">
            <!-- Branded Header -->
            <div style="text-align: center; margin-bottom: 40px;">
              <div style="display: inline-block; background: #3b82f6; padding: 10px; border-radius: 8px; margin-bottom: 16px;">
                <img src="https://img.icons8.com/isometric/50/ffffff/area-chart.png" width="24" height="24" style="display: block;"/>
              </div>
              <h1 style="font-size: 20px; font-weight: 800; letter-spacing: 0.1em; margin: 0; color: #fff;">INDMONEY PULSE</h1>
              <p style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 8px;">Institutional Sentiment Intelligence</p>
            </div>

            <!-- Header Section -->
            <div style="background: #1c212b; border-radius: 12px; padding: 32px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 24px;">
              <p style="font-size: 15px; margin: 0;">Hi <strong>{name}</strong>,</p>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-top: 12px;">
                Our AI engine has synthesized the latest feedback stream from the <strong>past 7 days</strong>. Analyzed all <strong>{pulse_data.get('total_reviews', 0)} reviews</strong> found in this window. Here are your prioritized strategic insights.
              </p>
            </div>

            <!-- Discovery Clusters -->
            <div style="margin-bottom: 40px;">
              <h2 style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 20px;">TOP 3 FEEDBACK THEMES</h2>
              {" ".join([f'''
                <div style="background: #1c212b; padding: 20px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid {['#3b82f6', '#a855f7', '#f97316'][i]};">
                  <h3 style="font-size: 14px; font-weight: 600; color: #fff; margin: 0 0 4px 0;">{t['name']} ({t.get('count', 0)} reviews)</h3>
                </div>
              ''' for i, t in enumerate(pulse_data.get('top_themes', [])[:3])])}
            </div>

            <!-- Signal Extraction -->
            <div style="margin-bottom: 40px;">
              <h2 style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 20px;">VOICE OF THE USER</h2>
              {" ".join([f'''
                <div style="background: #1c212b; padding: 20px; border-radius: 12px; margin-bottom: 12px; border-left: 1px solid rgba(168, 85, 247, 0.3);">
                  <p style="font-size: 13px; color: #cbd5e1; font-style: italic; line-height: 1.6; margin: 0;">"{q}"</p>
                </div>
              ''' for q in pulse_data.get('quotes', [])[:3]])}
            </div>

            <!-- Strategic Actions -->
            <div style="margin-bottom: 40px;">
              <h2 style="font-size: 11px; font-weight: 700; color: #f97316; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 20px;">Strategic Action Pulse</h2>
              <div style="background: #1c212b; border-radius: 12px; padding: 8px;">
                {" ".join([f'''
                  <div style="padding: 16px 20px; display: table; width: 100%;">
                    <span style="display: table-cell; width: 24px; color: #f97316; font-weight: 700;">✦</span>
                    <span style="display: table-cell; font-size: 13px; color: #f8fafc; line-height: 1.5;">{a}</span>
                  </div>
                ''' for a in pulse_data.get('action_ideas', [])[:3]])}
              </div>
            </div>

            <!-- Footer -->
            <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 32px; margin-top: 40px;">
              <p style="font-size: 11px; color: #64748b; margin: 0;">Generated by App Insight AI Intelligence (FastAPI Engine)</p>
              <p style="font-size: 10px; color: #475569; margin-top: 12px; text-transform: uppercase; letter-spacing: 0.1em;">© {datetime.now().year} INDMONEY Pulse. Ver: 4.2.0</p>
            </div>
          </div>
        </div>
        """
        return html_content

    async def send_weekly_pulse(self, recipient_email: str, recipient_name: str = "User"):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        pulse_path = os.path.join(base_dir, "reports", "weekly_pulse.json")
        target_email = recipient_email or os.getenv("EMAIL_RECEIVER")
        name = recipient_name or "User"

        # 1. Validation Checks
        if not self.smtp_user or not self.smtp_pass:
            print("[EMAIL ERROR] Missing SMTP_USER or SMTP_PASS environment variables.")
            return False, "Missing credentials (SMTP_USER/SMTP_PASS)"

        if not os.path.exists(pulse_path):
            print(f"[EMAIL ERROR] {pulse_path} not found.")
            return False, "Pulse data not found. Run analysis first."

        try:
            with open(pulse_path, 'r', encoding='utf-8') as f:
                pulse_data = json.load(f)

            html_content = self.get_pulse_html(pulse_data, name)

            # Build MIME Message
            msg = MIMEMultipart()
            msg['From'] = f'"{self.sender_label}" <{self.smtp_user}>'
            msg['To'] = target_email
            first_theme = pulse_data.get('top_themes', [{'name': 'Insights'}])[0].get('name', 'Insights')
            msg['Subject'] = f"Weekly Pulse: {first_theme}"
            msg.attach(MIMEText(html_content, 'html'))

            # 2. Connectivity Strategy (TLS vs SSL)
            print(f"[EMAIL] Attempting delivery to {target_email} via {self.smtp_host}:{self.smtp_port}...")
            
            if self.smtp_port == 465:
                # SSL approach
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=10)
            else:
                # TLS approach (Port 587 or 25)
                server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10)
                server.starttls()

            server.login(self.smtp_user, self.smtp_pass)
            server.send_message(msg)
            server.quit()

            print(f"[EMAIL] Successfully delivered to {target_email}")
            return True, "Success"

        except smtplib.SMTPAuthenticationError:
            err = "Authentication Failed. Please verify your SMTP_USER and ensure you use a Gmail APP PASSWORD, not your account password."
            print(f"[EMAIL ERROR] {err}")
            return False, err
        except Exception as e:
            err = f"Critical Failure: {str(e)}"
            print(f"[EMAIL ERROR] {err}")
            return False, err

# EmailService class defined above. Use as a factory.
