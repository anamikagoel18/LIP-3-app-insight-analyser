import requests
import json
import time

url = "http://localhost:8000/api/trigger"
# 4 weeks (28 days), 75 reviews (Quick)
data = {"limit": 75, "days": 28}
headers = {"Content-Type": "application/json"}

try:
    print(f"Triggering filtered analysis: {data}")
    response = requests.post(url, json=data, headers=headers)
    print(f"Trigger Status: {response.status_code}")
    
    # Poll for completion
    for _ in range(20):
        time.sleep(5)
        status_res = requests.get("http://localhost:8000/api/status")
        status_data = status_res.json()
        print(f"Status: {status_data.get('isProcessing')} - {status_data.get('progressLabel')}")
        if not status_data.get('isProcessing'):
            print("Processing complete!")
            break
            
    # Verify Pulse Report
    pulse_res = requests.get("http://localhost:8000/api/pulse")
    pulse_data = pulse_res.json()
    print("\nPulse Metadata Verification:")
    print(f"Review Limit: {pulse_data.get('review_limit')}")
    print(f"Time Range: {pulse_data.get('time_range')}")
    print(f"Analysis Status: {pulse_data.get('analysis_status')}")
    
    if pulse_data.get('review_limit') == 75 and pulse_data.get('time_range') == 28:
        print("\nSUCCESS: Filter logic is working and metadata is synced.")
    else:
        print("\nFAILED: Filter logic metadata mismatch.")

except Exception as e:
    print(f"Error: {e}")
