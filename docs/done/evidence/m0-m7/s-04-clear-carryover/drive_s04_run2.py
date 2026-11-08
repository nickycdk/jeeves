# Run 2: session-granted Bash permission across /clear (run 1's `date` needed no permission).
import sys, os, re, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; fresh_repo(SP)
CONT = 'SessionRelay spike continuation. Run the Bash command `touch perm_probe_2.txt`, then reply DONE2.'
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'default'], extra_env={'SRSPIKE_CONT1': CONT})
dialogs = []
def sq(): return re.sub(r'\s', '', c.tail(2500))
def handle(phase, choose):
    s = sq()
    if 'Doyouwantto' in s[-1500:]:
        box = s[s.rfind('Doyouwantto') - 200:]
        k = choose(box); dialogs.append({'phase': phase, 'dialog': box[:900], 'answer': repr(k)})
        c.note(f'permission dialog ({phase})', box[:300]); c.key(repr(k), k); c.pump(2); return True
    return False
def pick_session(box):
    opts = re.findall(r'(\d)\.(Yes[^❯]*?)(?=\d\.|Esc|$)', box)
    c.note('options', json.dumps(opts)[:400])
    for num, text in opts:
        if 'session' in text.lower(): return num.encode()
    for num, text in opts:
        if "don'taskagain" in text.lower() or 'don’taskagain' in text.lower(): return num.encode()
    return b'1'
def run_turn(phase, n, choose, timeout=120):
    c.wait(lambda: handle(phase, choose) and False or c.count('classic.Stop') > n, timeout, step=1.0, label=phase); c.pump(3)
c.boot()
n = c.count('classic.Stop'); c.prompt('Run the Bash command `touch perm_probe_1.txt`, then reply DONE1.')
run_turn('pre: touch', n, pick_session)
local = f"{SP}/repo/.claude/settings.local.json"
persisted = open(local).read() if os.path.exists(local) else None
c.note('settings.local.json after grant', repr(persisted))
n = c.count('classic.Stop'); c.prompt('/srspike')
c.wait(lambda: 'clear.resolved' in c.events(), 30, label='clear')
run_turn('post: touch', n, lambda b: b'\x1b')
json.dump({'dialogs': dialogs, 'settings_local_after_grant': persisted, 'files': sorted(os.listdir(f"{SP}/repo"))}, open(f"{SP}/run2-result.json", 'w'), indent=1, ensure_ascii=False)
c.close()
