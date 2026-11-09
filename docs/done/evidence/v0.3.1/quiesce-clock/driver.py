# Live check of the quiesce clock (review finding 1): a background server left running, a handover requested, nothing typed after.
import glob, json, os, re, shutil, subprocess, sys, time
PTY = sys.argv[1]; sp = os.path.abspath(sys.argv[2]); config = os.path.abspath(sys.argv[3])
sys.path.insert(0, PTY)
from ptylib import Claude
PLUGIN = os.path.dirname(os.path.dirname(PTY))
out, repo, state = f"{sp}/evidence", f"{sp}/repo", f"{sp}/state"
for d in (out, state, repo): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
subprocess.run('git init -q && echo hi > README.md && git add -A && git -c user.name=t -c user.email=t@t commit -qm init', shell=True, cwd=repo, check=True)
env = {'CLAUDE_CONFIG_DIR': config, 'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state, 'CLAUDE_CODE_DISABLE_1M_CONTEXT': '1'}
c = Claude(out, PLUGIN, repo, ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', '--debug-file', f"{sp}/claude-debug.log"], env)
def st():
    t = sorted(glob.glob(f"{state}/projects/*/tasks/*"))
    try: return json.load(open(f"{t[-1]}/state.json")) if t else {}
    except (OSError, ValueError): return {}
r = {'trust': c.accept_trust()}; c.pump(5)
c.line('/jeeves on'); r['on'] = c.wait(lambda: 'Jeeveson:task' in c.squeezed(4000), 30, label='/jeeves on'); c.pump(1)
c.line('This is a long task with ten steps; I will give you steps 2 to 10 later, so the task is not done until I say so and you must not report it complete. Step 1: start `python3 -m http.server 8765` with the Bash tool, run_in_background true, and leave it running. Then reply with the single word: started')
up = lambda: subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:8765/'], capture_output=True, text=True).stdout == '200'
r['turn1'] = c.wait(lambda: st().get('taskRevision') == 1 and up(), 180, step=3, label='server started')
c.pump(20)
r['server_up'] = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:8765/'], capture_output=True, text=True).stdout
c.line('/jeeves rotate'); c.note('rotate typed', 'nothing more is typed')
last, seen, deadline = None, [], time.time() + 26 * 60
while time.time() < deadline:
    if not c.pump(5): r['stopped'] = 'claude exited'; break
    s = st(); now = (s.get('status'), s.get('reason'), (s.get('rotation') or {}).get('quiesceCount'))
    if now != last: seen.append([round(c.now(), 1), *now, (s.get('rotation') or {}).get('requestedAt'), s.get('updatedAt')]); c.note('state', json.dumps(now)); last = now
    if s.get('status') in ('PAUSED', 'NEEDS_REVIEW', 'FAILED', 'DISABLED', 'HANDOVER_GENERATING'): c.pump(10); break
r['states'] = seen; r['final'] = {k: st().get(k) for k in ('status', 'reason', 'updatedAt')}
r['toast_on_screen'] = 'Paused:nosafepointtohandover(backgroundworkstillrunningafter20minutes)' in re.sub(r'\s', '', c.plain())
ev = glob.glob(f"{state}/projects/*/tasks/*/events.jsonl"); r['events'] = [json.loads(l) for l in open(ev[0])][-6:] if ev else []
c.close(); subprocess.run('pkill -f "http.server 8765"', shell=True)
json.dump(r, open(f"{out}/result.json", 'w'), indent=1); print(json.dumps(r, indent=1)[:6000])
