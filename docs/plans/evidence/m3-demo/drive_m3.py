# M3 gate demo: threshold (test override, argv[3], default 9) -> safe Stop -> handover requested -> Claude writes it ->
# parsed, validated, written once and hash-verified -> ROTATING. M3 never clears (ST-4.1 wires /clear).
import sys, os, re, time, json, glob, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'm1-relay-status'))
from ptylib import Claude, fresh_repo
SP, PLUGIN = sys.argv[1], sys.argv[2]
OVERRIDE = sys.argv[3] if len(sys.argv) > 3 else '9'
fresh_repo(SP, {'src/calc.js': 'export function add(a, b) { return a + b }\n', 'README.md': '# calc\n'})
STATE = f"{SP}/state"
c = Claude(SP, PLUGIN, [], extra_env={'SESSIONRELAY_TEST': '1', 'SESSIONRELAY_STATE_DIR': STATE, 'SESSIONRELAY_TEST_THRESHOLD_OVERRIDE': OVERRIDE})
def sq(n=4000): return re.sub(r'\s', '', c.tail(n))
def task_dir():
    d = glob.glob(f"{STATE}/projects/*/tasks/*")
    return d[0] if d else None
def state():
    d = task_dir()
    try: return json.load(open(f"{d}/state.json")) if d else None
    except (OSError, ValueError): return None
def status_is(*xs): return (state() or {}).get('status') in xs

end = time.time() + 90
while time.time() < end and not os.path.isdir(STATE):
    c.pump(1)
    if 'trustthisfolder' in sq(2500) and 'Entertoconfirm' in sq(2500):
        for k, b in (('Down', b'\x1b[B'), ('Up', b'\x1b[A'), ('Up', b'\x1b[A')):
            if c.selected().startswith('Yes'): break
            c.key(k, b); c.pump(0.6)
        c.enter(); c.pump(3)
c.pump(4)
out = {'override': OVERRIDE}

c.typ('/relay on'); c.pump(1.5); c.enter()
out['on_answered'] = c.wait(lambda: 'SessionRelayon:task' in sq(3000), 30, label='/relay on answer')
c.pump(1.5)
c.typ('Demo task: src/calc.js exports add(a, b); later we add sub and mul. For now reply with only the word OK.'); c.pump(0.8); c.enter()
c.wait(lambda: 'percent' in ((state() or {}).get('lastContext') or {}), 120, label='first reading')
c.pump(3)
out['after_first'] = {k: (state() or {}).get(k) for k in ('status', 'taskRevision', 'lastContext')}

# A large paste pushes context past the override; the turn's Stop (or the next one) asks for the handover.
filler = '\n'.join(f'Line {i:05d}: the quick brown fox jumps over the lazy dog, then counts sheep slowly.' for i in range(1, 1601))
os.write(c.fd, b'\x1b[200~' + filler.encode() + b'\x1b[201~'); c.pump(3)
c.typ(' Reply with only the word OK.'); c.pump(0.8); c.enter()
out['requested'] = c.wait(lambda: status_is('ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'NEEDS_REVIEW'), 180, label='rotation requested')
out['handover_requested'] = c.wait(lambda: status_is('HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'NEEDS_REVIEW'), 60, label='handover requested at the same Stop')
if not out['handover_requested']:
    # The reading came after that turn's Stop: one more short turn gives the next Stop.
    c.note('nudge', 'one more short turn for a Stop')
    c.typ('Reply with only the word OK.'); c.pump(0.8); c.enter()
    out['handover_requested'] = c.wait(lambda: status_is('HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'NEEDS_REVIEW'), 120, label='handover requested')
out['settled'] = c.wait(lambda: status_is('ROTATING', 'NEEDS_REVIEW', 'PAUSED'), 240, label='handover validated and saved')
c.pump(3)
s = state() or {}
d = task_dir()
out['final'] = {k: s.get(k) for k in ('status', 'reason', 'rotation', 'lastValidatedHandover', 'lastContext')}
ref = s.get('lastValidatedHandover') or ''
path = f"{d}/{ref.split('#')[0]}" if ref else None
if path and os.path.exists(path):
    body = open(path, 'rb').read()
    out['handover_file'] = ref.split('#')[0]
    out['sha256_matches_ref'] = ref.endswith('#sha256:' + hashlib.sha256(body).hexdigest())
    out['handover_md_identical'] = os.path.exists(f"{d}/handover.md") and open(f"{d}/handover.md", 'rb').read() == body
    open(f"{SP}/handover-001.md", 'wb').write(body)
out['history'] = sorted(os.listdir(f"{d}/history")) if d and os.path.isdir(f"{d}/history") else []
out['events'] = [json.loads(l) for l in open(f"{d}/events.jsonl")] if d else []
out['clear_ran'] = 'sessionrelay' in c.plain() and '/clear' in c.plain()
cost = re.findall(r'\$\d+\.\d{2}', c.plain())
out['cost_seen'] = cost[-1] if cost else None
c.close()
json.dump(out, open(f"{SP}/result.json", 'w'), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
