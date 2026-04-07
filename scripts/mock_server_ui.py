#!/usr/bin/env python3
import json
import threading
import time
import uuid
import sys
from http.server import ThreadingHTTPServer as HTTPServer, BaseHTTPRequestHandler

PENDING = {}
PENDING_LOCK = threading.Lock()

INDEX_HTML = r'''
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Approval Server (Mock UI)</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin: 24px; }
    button { margin-left: 8px; }
    li { margin: 10px 0; }
    pre { background: #f6f8fa; padding: 12px; }
  </style>
</head>
<body>
  <h1>Approval Queue (Mock)</h1>
  <div>
    Adapters: <select id="adapters"></select>
    <button id="refresh">Refresh</button>
  </div>
  <ul id="queue"></ul>
  <script>
    async function loadAdapters(){
      try{
        const r = await fetch('/adapters');
        const j = await r.json();
        const sel = document.getElementById('adapters');
        sel.innerHTML = '<option value="">All</option>';
        (j.adapters||[]).forEach(a=>{ const o = document.createElement('option'); o.value=a; o.textContent=a; sel.appendChild(o); });
      }catch(e){ console.warn(e); }
    }

    async function refresh(){
      try{
        const res = await fetch('/queue');
        const items = await res.json();
        const ul = document.getElementById('queue'); ul.innerHTML='';
        for(const it of items){
          const li = document.createElement('li');
          const span = document.createElement('span');
          span.innerHTML = `<strong>${it.tool_name||'(unknown)'}</strong> <small>[${it.agent||'claude'}]</small> <em>session=${it.session_id||''}</em> <code>${it.cwd||''}</code>`;
          li.appendChild(span);
          const allow = document.createElement('button'); allow.textContent='Allow'; allow.onclick = async () => { await decide(it.id,'allow'); };
          const deny = document.createElement('button'); deny.textContent='Deny'; deny.onclick = async () => { await decide(it.id,'deny'); };
          li.appendChild(allow); li.appendChild(deny);
          ul.appendChild(li);
        }
      }catch(e){ console.warn(e); }
    }

    async function decide(id, decision){
      try{
        await fetch('/decide/'+id, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ decision }) });
      }catch(e){ console.warn(e); }
      await refresh();
    }

    document.getElementById('refresh').addEventListener('click', refresh);
    loadAdapters();
    setInterval(refresh, 1500);
    refresh();
  </script>
</body>
</html>
'''

class Handler(BaseHTTPRequestHandler):
    def _set_headers(self, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.end_headers()

    def do_POST(self):
        path = self.path
        if path.startswith('/pending'):
            length = int(self.headers.get('Content-Length','0'))
            raw = self.rfile.read(length) if length else b''
            try:
                data = json.loads(raw.decode('utf-8')) if raw else {}
            except Exception:
                data = {}
            id = uuid.uuid4().hex
            enq = int(time.time() * 1000)
            ev = threading.Event()
            entry = {'id': id, 'payload': data, 'enqueuedAt': enq, 'event': ev, 'decision': None}
            with PENDING_LOCK:
                PENDING[id] = entry
            print(f"[mock-server-ui] queued id={id}", file=sys.stderr)
            waited = ev.wait(timeout=610)
            if not waited:
                print(f"[mock-server-ui] timeout id={id}", file=sys.stderr)
                with PENDING_LOCK:
                    PENDING.pop(id, None)
                self._set_headers('application/json', 200)
                try:
                    self.wfile.write(b'')
                except Exception:
                    pass
                return
            decision = entry.get('decision')
            agent = (data.get('agent') or 'claude')
            if decision is None or decision == 'dismiss':
                self._set_headers('application/json', 200)
                try:
                    self.wfile.write(b'')
                except Exception:
                    pass
                with PENDING_LOCK:
                    PENDING.pop(id, None)
                return
            # Build response per-agent
            if agent == 'copilot':
                if decision == 'allow':
                    resp = {'permissionDecision': 'allow'}
                else:
                    resp = {'permissionDecision': 'deny', 'permissionDecisionReason': (decision if decision != 'deny' else 'Denied by user')}
            elif agent == 'gemini':
                if decision == 'allow':
                    resp = {'decision': 'allow'}
                else:
                    resp = {'decision': 'deny', 'reason': (decision if decision != 'deny' else 'Denied by user')}
            else:
                if decision == 'allow':
                    resp = {'hookSpecificOutput': {'hookEventName': 'PermissionRequest', 'decision': {'behavior': 'allow'}}}
                else:
                    resp = {'hookSpecificOutput': {'hookEventName': 'PermissionRequest', 'decision': {'behavior': 'deny', 'message': (decision if decision != 'deny' else 'Denied by user')}}}
            body = json.dumps(resp).encode('utf-8')
            self._set_headers('application/json', 200)
            try:
                self.wfile.write(body)
            except Exception:
                pass
            with PENDING_LOCK:
                PENDING.pop(id, None)
            return

        elif path.startswith('/decide/'):
            id = path.split('/decide/')[-1]
            length = int(self.headers.get('Content-Length','0'))
            raw = self.rfile.read(length) if length else b''
            try:
                data = json.loads(raw.decode('utf-8')) if raw else {}
            except Exception:
                data = {}
            decision = data.get('decision')
            with PENDING_LOCK:
                entry = PENDING.get(id)
                if not entry:
                    self.send_response(404)
                    self.end_headers()
                    return
                entry['decision'] = decision
                entry['event'].set()
            self._set_headers('application/json', 200)
            try:
                self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            except Exception:
                pass
            return
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        path = self.path
        if path.startswith('/health'):
            self._set_headers('application/json', 200)
            self.wfile.write(json.dumps({'ok': True, 'pending': len(PENDING)}).encode('utf-8'))
            return
        if path.startswith('/adapters'):
            self._set_headers('application/json', 200)
            self.wfile.write(json.dumps({'adapters': ['claude','copilot','gemini']}).encode('utf-8'))
            return
        if path.startswith('/queue'):
            with PENDING_LOCK:
                arr = []
                for id, entry in list(PENDING.items()):
                    payload = entry.get('payload') or {}
                    arr.append({
                        'id': id,
                        'enqueuedAt': entry.get('enqueuedAt'),
                        'tool_name': payload.get('tool_name') or payload.get('toolName') or payload.get('tool') or '',
                        'tool_input': payload.get('tool_input') or payload.get('toolArgs') or payload.get('tool_args') or payload.get('input') or '',
                        'session_id': payload.get('session_id') or payload.get('sessionId') or payload.get('session') or None,
                        'cwd': payload.get('cwd') or payload.get('working_dir') or None,
                        'terminal_info': payload.get('terminal_info') or None,
                        'agent': payload.get('agent') or 'claude',
                    })
            self._set_headers('application/json', 200)
            self.wfile.write(json.dumps(arr).encode('utf-8'))
            return
        if path == '/' or path.startswith('/index.html'):
            self._set_headers('text/html', 200)
            self.wfile.write(INDEX_HTML.encode('utf-8'))
            return
        if path.startswith('/favicon.ico'):
            self.send_response(204)
            self.end_headers()
            return
        # not found
        self.send_response(404)
        self.end_headers()


def run(server_class=HTTPServer, handler_class=Handler, port=4759):
    # Bind to all interfaces so the UI is reachable from other devices on the local network
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    print(f"[mock-server-ui] starting on 0.0.0.0:{port}", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("[mock-server-ui] shutting down", file=sys.stderr)
        httpd.server_close()

if __name__ == '__main__':
    run()
