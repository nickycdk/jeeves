# M2 gate demo: /relay on, verbatim capture, context %, warning, request (test override, argv[3], default 6%).
import sys, os, re, time, json, glob
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'm1-relay-status'))
from ptylib import Claude, fresh_repo
SP, PLUGIN = sys.argv[1], sys.argv[2]
OVERRIDE = sys.argv[3] if len(sys.argv) > 3 else '6'
FIRST = 'Reply with only the word OK. Demo task: parse ÆØÅ — 🚀 ✅ (two  spaces)'
fresh_repo(SP)
STATE = f"{SP}/state"
c = Claude(SP, PLUGIN, [], extra_env={'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': STATE, 'JEEVES_TEST_THRESHOLD_OVERRIDE': OVERRIDE})
def sq(n=4000): return re.sub(r'\s', '', c.tail(n))
def task_dir():
    d = glob.glob(f"{STATE}/projects/*/tasks/*")
    return d[0] if d else None
def state():
    d = task_dir()
    try: return json.load(open(f"{d}/state.json")) if d else None
    except (OSError, ValueError): return None
def status(label):
    c.typ('/relay status'); c.pump(1.5); c.enter()
    c.wait(lambda: 'Jeevesmode:' in sq(1500), 30, label=label)
    c.pump(1.5)
    lines = [l.rstrip() for l in c.tail(3000).split('\n') if l.strip()]
    i = max((k for k, l in enumerate(lines) if 'mode:' in l), default=-1)
    shot = lines[i:i + 9] if i >= 0 else lines[-12:]
    c.note(f'status {label}', ' | '.join(shot))
    return shot

# Boot and trust dialog, as in M1.
end = time.time() + 90
while time.time() < end and not os.path.isdir(STATE):
    c.pump(1)
    if 'trustthisfolder' in sq(2500) and 'Entertoconfirm' in sq(2500):
        for k, b in (('Down', b'\x1b[B'), ('Up', b'\x1b[A'), ('Up', b'\x1b[A')):
            if c.selected().startswith('Yes'): break
            c.key(k, b); c.pump(0.6)
        c.enter(); c.pump(3)
c.pump(4)
out = {}

# 1. Turn on (no goal): the notice, then the first typed prompt is captured.
c.typ('/relay on'); c.pump(1.5); c.enter()
out['on_answered'] = c.wait(lambda: 'Jeeveson:task' in sq(3000), 30, label='/relay on answer')
c.pump(1.5)
out['notice_shown'] = 'keepstaskstateonthismachineonly' in sq(4000)
c.typ(FIRST); c.pump(0.8); c.enter()
out['first_measure'] = c.wait(lambda: (state() or {}).get('lastContext', {}) and 'percent' in (state() or {}).get('lastContext', {}), 120, label='first context reading')
c.pump(2)
d = task_dir()
rev1 = open(f"{d}/task-rev-001.md", encoding='utf-8').read() if d and os.path.exists(f"{d}/task-rev-001.md") else None
out['rev1_byte_identical'] = rev1 == FIRST
out['rev1_repr'] = repr(rev1)
out['after_first'] = {k: (state() or {}).get(k) for k in ('status', 'taskRevision', 'lastContext', 'warnedSessionId')}
out['warning_on_screen'] = f'SessionRelaywillhandoverat{OVERRIDE}%' in re.sub(r'\s', '', c.plain())
out['status_after_first'] = status('after first reply')

# 2. One large pasted prompt (~35k tokens) pushes context past 6%.
filler = '\n'.join(f'Line {i:05d}: the quick brown fox jumps over the lazy dog, then counts sheep slowly.' for i in range(1, 1601))
c.note('paste', f'{len(filler)} chars')
os.write(c.fd, b'\x1b[200~' + filler.encode() + b'\x1b[201~'); c.pump(3)
c.typ(' Reply with only the word OK.'); c.pump(0.8); c.enter()
out['requested'] = c.wait(lambda: (state() or {}).get('status') == 'ROTATION_REQUESTED', 180, label='ROTATION_REQUESTED')
c.pump(2)
out['after_paste'] = {k: (state() or {}).get(k) for k in ('status', 'reason', 'lastContext', 'armedFired', 'thresholdPercent')}
out['status_after_paste'] = status('after paste')
out['events'] = [json.loads(l) for l in open(f"{d}/events.jsonl")] if d else []
out['heartbeat'] = json.load(open(f"{d}/lock.d/owner.json")) if d and os.path.exists(f"{d}/lock.d/owner.json") else None
cost = re.findall(r'\$\d+\.\d{2}', c.plain())
out['cost_seen'] = cost[-1] if cost else None
c.close()
out['lock_released_on_exit'] = not os.path.exists(f"{d}/lock.d") if d else None
json.dump(out, open(f"{SP}/result.json", 'w'), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
