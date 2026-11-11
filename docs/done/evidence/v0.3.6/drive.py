# Live check of plan 12: the threshold hint once per task after a handover, and the completion summary.
# Usage: python3 drive.py <jeeves/tests/pty> <scratch dir>
import glob, json, math, os, re, shutil, subprocess, sys
PTY = os.path.abspath(sys.argv[1]); sp = os.path.abspath(sys.argv[2])
sys.path.insert(0, PTY)
from ptylib import Claude
PLUGIN = os.path.dirname(os.path.dirname(PTY))
out, repo, state = f"{sp}/evidence", f"{sp}/repo", f"{sp}/state"
for d in (out, state, repo): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
open(f"{repo}/test.sh", 'w').write('echo "running 3 tests"\necho "all 3 passed"\n')
git = lambda cmd: subprocess.run(cmd, shell=True, cwd=repo, check=True, capture_output=True, text=True).stdout
git('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init')
env = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state, 'CLAUDE_CODE_DISABLE_1M_CONTEXT': '1'}
c = Claude(out, PLUGIN, repo, ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(sh:*)', 'Bash(git:*)', '--debug-file', f'{out}/debug.log'], env)
def task():
    t = sorted(glob.glob(f"{state}/projects/*/tasks/*")); return t[-1] if t else None
def st():
    try: return json.load(open(f"{task()}/state.json"))
    except (OSError, ValueError, TypeError): return {}
pct = lambda: (st().get('lastContext') or {}).get('percent')
# The screen redraws a toast many times; the debug log has one line per toast shown.
hints = lambda: open(f'{out}/debug.log').read().count('$.ui.toast (jeeves): this conversation started at')
def rotate(n):
    c.line('/jeeves rotate')
    ok = c.wait(lambda: st().get('rotationCount') == n and st().get('status') == 'MONITORING', 300, step=3, label=f'rotation {n} rearmed')
    c.pump(20)
    return ok
r = {'trust': c.accept_trust()}; c.pump(5)
c.line('/jeeves on'); r['on'] = c.wait(lambda: st().get('status') == 'MONITORING', 30, label='/jeeves on'); c.pump(1)
c.line('This is a long task with several steps; I give you the next steps later, so do not report it complete yet. Step 1: run `sh test.sh` with the Bash tool, exactly as written. Reply with the single word: ok')
c.wait(lambda: pct() is not None and st().get('ledger'), 180, step=2, label='first reading')
c.line('/jeeves check sh test.sh'); c.pump(3)
p0 = pct(); r['first_reading'] = p0
# A fresh conversation starts ~7 points below this first reading (run 1: 25.6% here, 18.0% fresh), so T = p0 + 8
# rearms it (below T-10) with under 20 points of room.
T = max(20, math.ceil(p0) + 8); r['threshold'] = T
c.line(f'/jeeves threshold {T}'); c.wait(lambda: st().get('thresholdPercent') == T, 20, label='threshold'); c.pump(2)
r['rotation1'] = rotate(1); r['fresh1_reading'] = pct(); r['hints_after_1'] = hints()
r['store_flag_not_in_state'] = 'roomHint' not in json.dumps(st())
for i in (1, 2):
    open(f"{repo}/f{i}.txt", 'w').write(f'{i}\n'); git(f'git add -A && git -c user.name=t -c user.email=t@t commit -qm c{i}')
r['rotation2'] = rotate(2); r['fresh2_reading'] = pct(); r['hints_after_2'] = hints()
c.line('Final step: run `sh test.sh` with the Bash tool exactly as written. The task is then complete: end your reply with the JEEVES-COMPLETE block from your instructions.')
r['completed'] = c.wait(lambda: st().get('status') == 'COMPLETED', 240, step=2, label='completed'); c.pump(5)
flat = re.sub(r'\s+', ' ', c.plain())
m = re.search(r'task completed in [^.]*\.', flat); r['summary_line1'] = m and m.group(0)
m = re.search(r'context cleared [^.]*\.(?: Cost: [^)]*\)?\.?)?|Cost: \$[0-9.]+[^.]*\.', flat); r['summary_line2'] = m and m.group(0)
c.line('/jeeves stats'); c.pump(6)
i = c.plain().rfind('Jeeves stats'); r['stats'] = re.sub(r'[ \t]+', ' ', c.plain()[i:i + 1500]) if i >= 0 else None
r['git_commits_since_start'] = len(git(f"git log --oneline {st().get('taskStartHead')}..HEAD").splitlines())
r['state'] = {k: st().get(k) for k in ('status', 'reason', 'rotationCount', 'sessionSequence', 'thresholdPercent', 'updatedAt')}
r['sessions'] = [json.load(open(f)) for f in sorted(glob.glob(f"{task()}/sessions/*.json"))]
r['events'] = [json.loads(l) for l in open(f"{task()}/events.jsonl")]
c.close()
json.dump(r, open(f"{out}/result.json", 'w'), indent=1); print(json.dumps({k: v for k, v in r.items() if k not in ('events',)}, indent=1)[:6000])
