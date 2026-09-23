#!/usr/bin/env bash
# Serves the store at http://127.0.0.1:8080/store.html. First writes store/config.local.js from
# ANTHROPIC_API_KEY (and optional ANTHROPIC_WORKSPACE_ID) in the repo's .env. Both files are
# gitignored. Binds to 127.0.0.1 so the key isn't reachable from other machines on the network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/store"

python3 - "$ROOT/.env" <<'PY'
import json, pathlib, re, sys
env = pathlib.Path(sys.argv[1])
text = env.read_text() if env.exists() else ''
def get(name):
    m = re.search(r'^\s*%s\s*=\s*(.*?)\s*$' % name, text, re.M)
    return m.group(1).strip('"\'') if m else ''
key, ws = get('ANTHROPIC_API_KEY'), get('ANTHROPIC_WORKSPACE_ID')
out = pathlib.Path('config.local.js')
if key:
    js = 'window.RITUAL_AI_KEY = %s;\n' % json.dumps(key)
    if ws:
        js += 'window.RITUAL_AI_WORKSPACE = %s;\n' % json.dumps(ws)
    out.write_text(js)
    out.chmod(0o600)
    print('config.local.js written from .env')
else:
    out.unlink(missing_ok=True)
    print('No ANTHROPIC_API_KEY in .env; the widget will ask for a key')
PY

# no-store so edits to widget.js / config.local.js show up on reload instead of from cache.
exec python3 - <<'PY'
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
ThreadingHTTPServer(("127.0.0.1", 8080), NoCache).serve_forever()
PY
