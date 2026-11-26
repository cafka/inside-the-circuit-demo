"""Local inspection only. Never executes CAD scripts/macros or infers missing geometry."""
import json, sys, hashlib, zipfile, re
from pathlib import Path
import fitz

source, output = map(Path, sys.argv[1:3])
data = source.read_bytes()
result = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
if data.startswith(b'%PDF-'):
    document = fitz.open(stream=data, filetype='pdf')
    assert len(document) <= 300, 'document_page_limit'
    result['type'] = 'pdf'
    result['pages'] = []
    result['links'] = []
    for i, page in enumerate(document):
        text = page.get_text()
        result['pages'].append({'page': i+1, 'text': text})
        for link in page.get_links():
            if link.get('uri', '').startswith('https://'):
                rect = link['from']
                result['links'].append({'url': link['uri'], 'page': i+1, 'text': page.get_textbox(rect), 'context': page.get_textbox(fitz.Rect(0, rect.y0-2, page.rect.width, rect.y1+2))})
    result['metadata'] = document.metadata
    result['copyrightStatements'] = sorted(set(re.findall(r'(?:Copyright|©)\s*[^\n]+', '\n'.join(p['text'] for p in result['pages']), re.I)))
elif zipfile.is_zipfile(source):
    result['type'] = 'zip'
    with zipfile.ZipFile(source) as archive:
        assert len(archive.infolist()) <= 10000, 'archive_entry_limit'
        result['members'] = [{'name': i.filename, 'bytes': i.file_size, 'compressedBytes': i.compress_size} for i in archive.infolist()]
        result['licenses'] = []
        for info in archive.infolist():
            if re.search(r'(^|/)(LICENSE|COPYING|NOTICE)(\.|$)', info.filename, re.I) and info.file_size < 100000:
                result['licenses'].append({'member': info.filename, 'text': archive.read(info).decode('utf-8', errors='replace')})
else:
    result['type'] = 'other'
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
