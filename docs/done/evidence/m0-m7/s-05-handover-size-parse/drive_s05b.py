import sys, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]; TRIALS = int(sys.argv[2]) if len(sys.argv) > 2 else 10
fresh_repo(SP, {'calc.js': 'export function add(a, b) {\n  return a + b\n}\n', 'README.md': '# calc\nTiny math helpers.\n'})
TASKS = ['sub(a, b) returning a - b', 'mul(a, b) returning a * b', 'div(a, b) returning a / b and throwing on b === 0',
         'pow(a, b) returning a ** b', 'mod(a, b) returning a % b', 'max(a, b) returning the larger value',
         'min(a, b) returning the smaller value', 'avg(a, b) returning the mean', 'abs(a) returning the absolute value',
         'clamp(x, lo, hi) clamping x into [lo, hi]']
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits'])
c.boot()
for t in range(1, TRIALS + 1):
    c.prompt(f'In calc.js add an exported function {TASKS[(t - 1) % len(TASKS)]}. Use the Edit tool once, then reply with one short line.')
    c.wait(lambda: c.count('trial.result') >= t, 180, step=1.5, label=f'trial {t}')
    c.pump(3); c.typ('/clear'); c.pump(1); c.enter(); c.pump(4)
c.close()
res = [r for r in c.rows() if r['ev'] == 'trial.result']
print(json.dumps(res, indent=0))
print('firstTry', sum(r['firstTry'] for r in res), '/', len(res), ' within2', sum(r['okWithin2Retries'] for r in res), '/', len(res))
