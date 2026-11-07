import sys, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; TRIALS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
fresh_repo(SP)
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits'])
c.boot()
for t in range(1, TRIALS + 1):
    stops = c.count('classic.Stop') + c.count('trial.stop')
    c.prompt(f'Create 8 files named q{t}_1.txt through q{t}_8.txt using the Write tool. Make exactly one Write call per message, strictly one after another (never parallel), each file containing only its number. When all 8 exist, reply DONE.')
    c.wait(lambda: c.count('trial.stop') >= t, 150, step=1.5, label=f'trial {t} stop')
    c.pump(4)
    c.typ('/clear'); c.pump(1); c.enter(); c.pump(4)
c.close()
for r in c.rows():
    if r['ev'] in ('quiesce.appended', 'trial.stop'): print(json.dumps({k: r[k] for k in r if k not in ('sid', 't')}))
