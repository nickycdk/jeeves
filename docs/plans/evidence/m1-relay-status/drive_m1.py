# M1 gate live check: load SessionRelay with --plugin-dir, run /relay status, read the answer off the screen.
import sys, os, re, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ptylib import Claude, fresh_repo
SP, PLUGIN = sys.argv[1], sys.argv[2]
fresh_repo(SP)
STATE = f"{SP}/state"
c = Claude(SP, PLUGIN, [], extra_env={'SESSIONRELAY_TEST': '1', 'SESSIONRELAY_STATE_DIR': STATE})
def sq(n=4000): return re.sub(r'\s', '', c.tail(n))
# Boot: accept the trust dialog (No is preselected in 2.1.319), wait for session.start to create the state folder.
end = time.time() + 90
while time.time() < end and not os.path.isdir(STATE):
    c.pump(1)
    if 'trustthisfolder' in sq(2500) and 'Entertoconfirm' in sq(2500):
        for k, b in (('Down', b'\x1b[B'), ('Up', b'\x1b[A'), ('Up', b'\x1b[A')):
            if c.selected().startswith('Yes'): break
            c.key(k, b); c.pump(0.6)
        c.note('trust dialog selected', repr(c.selected()[:30]))
        c.enter(); c.pump(3)
c.note('state folder created by session.start', str(os.path.isdir(STATE)))
mode = oct(os.stat(STATE).st_mode & 0o777) if os.path.isdir(STATE) else None
c.pump(4)
c.typ('/relay status'); c.pump(1.5); c.enter()
ok = c.wait(lambda: 'SessionRelaymode:' in sq(), 30, label='/relay status answer')
c.pump(2)
lines = [l.rstrip() for l in c.tail(5000).split('\n') if l.strip()]
start = max((i for i, l in enumerate(lines) if 'SessionRelay' in l and 'mode:' in l), default=-1)
excerpt = lines[start:start + 10] if start >= 0 else lines[-15:]
c.close()
json.dump({'answered': ok, 'state_dir_mode': mode, 'excerpt': excerpt,
           'types_laid': os.path.isfile(f"{PLUGIN}/.claude-plugin/types/claude-code/index.d.ts")}, open(f"{SP}/result.json", 'w'), indent=1, ensure_ascii=False)
print(json.dumps(json.load(open(f"{SP}/result.json")), indent=1, ensure_ascii=False))
