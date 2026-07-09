# -*- coding: utf-8 -*-
import os
import requests

URL = "http://127.0.0.1:8000/api/upload"

# Look inside the backend folder explicitly
pdf_filename = os.path.join("backend", "AI Governance & Compliance Assistant — Master Project Specification.pdf")

if not os.path.exists(pdf_filename):
    print(f"❌ Could not find {pdf_filename}")
    exit(1)

payload = {
    'framework_ids': '1',
    'document_type': 'system_specification'
}

print(f"🚀 Sending {pdf_filename} to backend...")
with open(pdf_filename, 'rb') as f:
    files = {'file': (pdf_filename, f, 'application/pdf')}
    try:
        r = requests.post(URL, data=payload, files=files)
        print(f"📡 Status: {r.status_code}")
        print(r.text)
    except Exception as e:
        print(f"❌ Failed: {e}")