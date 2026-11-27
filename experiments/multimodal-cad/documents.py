"""Create numbered manufacturer-document excerpts from a supplied PDF.
No board catalogue or evaluation annotation is an input. This does not verify
that a model's citation entails its proposed component identity.
"""
import hashlib, json, sys
from pathlib import Path
import fitz

pdf, source_url, output = sys.argv[1:4]
source = Path(pdf)
lines = []
with fitz.open(source) as document:
    for page_index, page in enumerate(document):
        for text in page.get_text().splitlines():
            text = text.strip()
            if text:
                lines.append({'id': f'D1-L{len(lines)+1}', 'page': page_index+1, 'text': text})
value = {'documents': [{'id': 'D1', 'url': source_url,
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'lines': lines}]}
Path(output).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf8')
print(json.dumps({'lines': len(lines), 'canonicalSHA256': hashlib.sha256(
    json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()}))
