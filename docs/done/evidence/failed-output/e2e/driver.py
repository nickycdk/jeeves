# Live check of plan 11: a failed command's output lines reach the handover and the fresh conversation; a pass removes them.
import glob, json, os, re, shutil, subprocess, sys, time
PTY = sys.argv[1]; sp = os.path.abspath(sys.argv[2])
sys.path.insert(0, PTY)
from ptylib import Claude
PLUGIN = os.path.dirname(os.path.dirname(PTY))
out, repo, state = f"{sp}/evidence", f"{sp}/repo", f"{sp}/state"
for d in (out, state, repo): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
open(f"{repo}/test.sh", 'w').write('echo "running 3 tests"\nif [ -f fixed ]; then echo "all 3 passed"; exit 0; fi\necho "FAIL calc.test: expected 4, got 5" >&2\nexit 1\n')
subprocess.run('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init', shell=True, cwd=repo, check=True)
env = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state, 'CLAUDE_CODE_DISABLE_1M_CONTEXT': '1'}
c = Claude(out, PLUGIN, repo, ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(sh:*)'], env)
def task():
    t = sorted(glob.glob(f"{state}/projects/*/tasks/*")); return t[-1] if t else None
def st():
    try: return json.load(open(f"{task()}/state.json"))
    except (OSError, ValueError, TypeError): return {}
tails = lambda: [e.get('tail') for e in st().get('ledger', []) if e.get('tail')]
def rotate(n):
    c.line('/jeeves rotate')
    ok = c.wait(lambda: st().get('rotationCount') == n and st().get('status') in ('MONITORING', 'CONTINUING') and os.path.exists(f"{task()}/history/handover-00{n}.md"), 300, step=3, label=f'rotation {n}')
    c.pump(25)  # let the fresh conversation answer its continuation
    return ok
r = {'trust': c.accept_trust()}; c.pump(5)
c.line('/jeeves on'); r['on'] = c.wait(lambda: 'Jeeveson:task' in c.squeezed(4000) or st().get('status') == 'MONITORING', 30, label='/jeeves on'); c.pump(1)
c.line('This is a long task with several steps; I give you the next steps later, so do not report it complete. Step 1: run `sh test.sh` with the Bash tool, exactly as written. Do not fix anything. Reply with the single word: failed')
r['failed_tail'] = c.wait(lambda: bool(tails()), 180, step=2, label='tail stored') and tails()
r['schema_on_disk_1'] = st().get('schemaVersion')
c.pump(10)
r['rotation1'] = rotate(1)
h1 = open(f"{task()}/history/handover-001.md").read()
i = h1.find('- Output of failed commands'); r['handover1_block'] = h1[i:i + 600]
r['handover1_size'] = len(h1)
open(f"{repo}/fixed", 'w').write('')
c.line('Step 2: run `sh test.sh` again with the Bash tool, exactly as written. Reply with the single word: passed')
r['tail_cleared'] = c.wait(lambda: any(e.get('command') == 'sh test.sh' and e.get('exit') == 0 for e in st().get('ledger', [])), 180, step=2, label='pass') and not tails()
r['schema_on_disk_2'] = st().get('schemaVersion')
c.pump(10)
r['rotation2'] = rotate(2)
h2 = open(f"{task()}/history/handover-002.md").read()
i = h2.find('- Output of failed commands'); r['handover2_block'] = h2[i:i + 200]
r['transcript_has_tail'] = 'FAIL calc.test' in re.sub(r'\s+', ' ', c.plain())
r['events'] = [json.loads(l) for l in open(f"{task()}/events.jsonl")][-8:]
shutil.copy(f"{task()}/history/handover-001.md", f"{out}/handover-001.md"); shutil.copy(f"{task()}/history/handover-002.md", f"{out}/handover-002.md")
c.close()
json.dump(r, open(f"{out}/result.json", 'w'), indent=1); print(json.dumps(r, indent=1)[:5000])
