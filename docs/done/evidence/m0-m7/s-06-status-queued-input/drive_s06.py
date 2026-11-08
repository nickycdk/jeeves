import sys, os, re, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; fresh_repo(SP)
D = f"{SP}/statedir"; os.system(f'rm -rf {D}'); os.makedirs(D)
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits'], extra_env={'SRSPIKE_DIR': D})
shots = {}
def shot(name, n=12):
    lines = [l for l in c.tail(6000).split('\n') if l.strip()]
    shots[name] = lines[-n:]; c.note(f'screen {name}', ' | '.join(lines[-4:])[:300])
def sq(): return re.sub(r'\s', '', c.tail(3000))
def since(ev, n): return [r for r in c.rows() if r['ev'] == ev and r.get('n') == n]
c.boot(); c.pump(4); shot('idle-with-status')
shots['status_visible_idle'] = 'SR-STATUS' in sq()
# A) prompt typed while rotation 1 is queued
c.prompt('Reply with the single word ONE.')
c.wait(lambda: since('rotation.queued', 1), 90, label='rotation 1 queued')
c.pump(1); shot('rotation-queued')
c.prompt('TYPED-DURING-ROTATION: please reply with the word HELD-OK')
c.pump(2); shot('after-typed-during-rotation')
shots['held_message_on_screen'] = 'HeldbySessionRelay' in sq()
c.wait(lambda: 'CONT-1' in ' '.join(r.get('text', '') for r in c.rows() if r['ev'] == 'turn.complete'), 90, label='continuation 1')
c.pump(2); shot('after-continuation-1')
# B) a dialog open when the queued /clear comes due
c.prompt('Reply with the single word TWO.')
c.wait(lambda: since('rotation.queued', 2), 90, label='rotation 2 queued')
c.typ('/model'); c.pump(1); c.enter(); c.pump(2); shot('dialog-open')
shots['dialog_seen'] = 'Esc' in c.tail(1500)
c.note('dialog open; holding 20s past the clear due time')
c.pump(20)
cr = since('clear.resolved', 2); shots['clear_resolved_while_dialog_open'] = bool(cr)
shot('dialog-after-20s')
c.key('Esc', b'\x1b'); c.pump(1)
c.wait(lambda: since('clear.resolved', 2), 40, label='clear 2 after Esc')
c.wait(lambda: 'CONT-2' in ' '.join(r.get('text', '') for r in c.rows() if r['ev'] == 'turn.complete'), 60, label='continuation 2')
c.pump(2); shot('end')
c.close()
json.dump(shots, open(f"{SP}/screens.json", 'w'), indent=1, ensure_ascii=False)
for r in c.rows(): print(json.dumps({k: r[k] for k in r if k not in ('sid',)})[:400])
