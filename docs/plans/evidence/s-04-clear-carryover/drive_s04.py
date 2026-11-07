import sys, os, re, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; fresh_repo(SP)
EXTRA = f"{SP}/extra"; os.makedirs(EXTRA, exist_ok=True); open(f"{EXTRA}/note.txt", 'w').write('ADDDIR-MARKER-7731\n')
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'default', '--add-dir', EXTRA], extra_env={'SRSPIKE_EXTRA': EXTRA})
dialogs = []
def sq(): return re.sub(r'\s', '', c.tail(2500))
def handle(phase, choose):
    """If a permission dialog is open, record it and answer with choose(squashed_text) -> bytes."""
    s = sq()
    if 'Doyouwantto' in s[-1500:] and ('Esctocancel' in s[-1500:] or '3.No' in s[-1500:]):
        box = s[s.rfind('Doyouwantto') - 300:]
        k = choose(box); dialogs.append({'phase': phase, 'dialog': box[:700], 'answer': repr(k)})
        c.note(f'permission dialog ({phase})', box[:200]); c.key(repr(k), k); c.pump(2); return True
    return False
def pick_session(box):
    m = re.search(r'(\d)\.Yes,[^0-9]*?(session|don.taskagain)', box)
    return m.group(1).encode() if m else b'1'
def run_turn(phase, stops_before, choose, timeout=150):
    end_ok = c.wait(lambda: handle(phase, choose) and False or c.count('classic.Stop') > stops_before, timeout, step=1.5, label=phase)
    c.pump(3); return end_ok
c.boot()
# 1) add-dir read + Bash permission granted with the session/don't-ask-again option
n = c.count('classic.Stop'); c.prompt(f'Read the file {EXTRA}/note.txt with the Read tool and quote it. Then run the Bash command `date +%Y` and show the output.')
run_turn('pre: read+bash', n, pick_session)
# 2) session cron
n = c.count('classic.Stop'); c.prompt("Use the CronCreate tool (load it with ToolSearch first if needed) to schedule a recurring task with cron '17 * * * *' and prompt 'echo ping'. Then reply OK.")
run_turn('pre: cron', n, lambda b: b'1')
# 3) rotation 1 (default mode), after-rotation dialogs are answered No via Esc and recorded
n = c.count('classic.Stop'); c.prompt('/srspike')
c.wait(lambda: 'clear.resolved' in c.events(), 30, label='clear 1')
run_turn('post1: continuation', n, lambda b: b'\x1b', timeout=180)
# 4) plan mode then rotation 2
for i in range(4):
    if 'planmodeon' in sq()[-600:].lower(): break
    c.key('Shift+Tab', b'\x1b[Z'); c.pump(1)
c.note('mode line', sq()[-300:])
n = c.count('classic.Stop'); c.prompt('/srspike')
c.wait(lambda: c.count('clear.resolved') >= 2, 30, label='clear 2')
run_turn('post2: plan check', n, lambda b: b'\x1b', timeout=120)
c.note('mode line after rotation 2', sq()[-300:])
json.dump(dialogs, open(f"{SP}/dialogs.json", 'w'), indent=1)
c.close()
