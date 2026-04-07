#!/usr/bin/env python3
import json
import threading
import time
import uuid
import sys
from http.server import ThreadingHTTPServer as HTTPServer, BaseHTTPRequestHandler

PENDING = {}
PENDING_LOCK = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def _set_headers(self, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.end_headers()

    def do_POST(self):
        if self.path.startswith('/pending'):
            length = int(self.headers.get('Content-Length', '0'))
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
            print(f"[mock-server] queued id={id}", file=sys.stderr)
            # Wait for decision (max 610s)
            waited = ev.wait(timeout=610)
            if not waited:
                print(f"[mock-server] timeout id={id}", file=sys.stderr)
                # respond empty
                try:
                    self._set_headers('application/json', 200)
                    self.wfile.write(b'')
                finally:
                    with PENDING_LOCK:
                        PENDING.pop(id, None)
                return
            decision = entry.get('decision')
            agent = (data.get('agent') or 'claude')
            if decision is None or decision == 'dismiss':
                # empty response
                self._set_headers('application/json', 200)
                try:
                    self.wfile.write(b'')
                finally:
                    with PENDING_LOCK:
                        PENDING.pop(id, None)
                return
            # Build agent-appropriate response
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
            finally:
                with PENDING_LOCK:
                    PENDING.pop(id, None)
            return

        elif self.path.startswith('/decide/'):
            id = self.path.split('/decide/')[-1]
            length = int(self.headers.get('Content-Length', '0'))
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
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            return
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path.startswith('/queue'):
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
        elif self.path.startswith('/adapters'):
            self._set_headers('application/json', 200)
            self.wfile.write(json.dumps({'adapters': ['claude','copilot','gemini']}).encode('utf-8'))
            return
        else:
            self.send_response(404)
            self.end_headers()

def run(server_class=HTTPServer, handler_class=Handler, port=4759):
    server_address = ('127.0.0.1', port)
    httpd = server_class(server_address, handler_class)
    print(f"[mock-server] starting on 127.0.0.1:{port}", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("[mock-server] shutting down", file=sys.stderr)
        httpd.server_close()

if __name__ == '__main__':
    run()
