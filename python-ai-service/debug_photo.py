import requests
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path('..') / 'springboot-backend' / 'backend' / '.env')

url = os.environ.get('PHOTO_DB_URL', '')
print('PHOTO_DB_URL:', url)

if not url:
    print('ERROR: PHOTO_DB_URL is empty in .env')
else:
    try:
        r = requests.get(f'{url}A/16/AI/877', timeout=15)
        print('Status:', r.status_code)
        print('Content-Type:', r.headers.get('content-type', ''))
        print('Content length:', len(r.content))
        print('Response:', r.text[:300])
    except Exception as e:
        print('Error:', e)
