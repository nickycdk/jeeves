import sys, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; fresh_repo(SP)
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits'])
c.boot()
for i, (n, ch) in enumerate([(4000, 'ctx'), (12000, 'ctx'), (30000, 'ctx'), (30000, 'submit')], 1):
    c.prompt(f'/srsize {n} {ch}')
    c.wait(lambda: c.count('size.result') >= i, 150, step=1.5, label=f'size {n} {ch}')
    c.pump(2)
c.close()
for r in c.rows():
    if r['ev'] == 'size.result': print(json.dumps({k: r[k] for k in r if k not in ('sid', 't')}))
