# AC-41 live runs (ST-15.2, D-49): the `long-task` fixture in a real interactive `claude`, haiku, on the maintainer's
# Team account through the fresh-install command (a separate CLAUDE_CONFIG_DIR, a scratch JEEVES_STATE_DIR).
#
#   python3 tests/pty/ac41.py <dry|200k|auto|base> <scratch dir> --config-dir <dir> --modules N --cap <US$> [--minutes M]
#
#   dry   fresh install, one prompt (a 1-module fixture): first-run notice, an auto task with the prompt word for word,
#         nothing recorded before it; tokens and cost per call (AC-35 E)
#   200k  JEEVES_TEST_WINDOW_OVERRIDE=200000, the task started with /jeeves on (D-42), D-45's four parts
#   auto  fresh install again, 1M window, auto mode: nothing typed but the task; NFR-10 grep of the state folder
#   base  the same task without Jeeves (no --plugin-dir); one conversation, auto-compaction is its outcome
#
#   --fixture distinct-task (default, ST-17.2) or long-task (v0.3.0's evidence, the six-function cycle).
#   --window  the real window for the growth figures (default 200K for 200k, else 1M; ST-17.3 passes 200000 to auto).
#   --no-1m   CLAUDE_CODE_DISABLE_1M_CONTEXT=1: haiku on a real 200K window (ST-17.3; /context read 31.1k/200k, autocompact
#             buffer 33k, so compaction at ~83.5%).
#   A run is stopped as void, by itself, when one commit holds more than one module or a module is committed before
#   any tool call named its test file (ST-17.2: a scripted run is reported in minutes, not after its cap).
#
# Spend is API-equivalent dollars from the transcripts (transcripts.py), checked every minute; a run past its cap is
# killed and reported as partial. Nothing is typed into a running task: /cost would be a keystroke.
import argparse, glob, json, os, re, shutil, signal, statistics, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402
import transcripts  # noqa: E402

NODE = ['node', '--experimental-strip-types', '--no-warnings']
NOTICE, UPGRADE = 'Jeeveswatcheslongsessionshere', 'Jeevescannowwatch'  # the first-run and upgrade notices, squeezed
STOPS = ('POSSIBLE_LOOP', 'NEEDS_REVIEW', 'FAILED')


def fixture(repo, modules, name='distinct-task'):
    subprocess.run([*NODE, f"{PLUGIN}/tests/fixtures/build-repo.ts", name, repo, '--modules', str(modules)], check=True, capture_output=True)
    return subprocess.run([*NODE, '-e', f"import('{PLUGIN}/tests/fixtures/build-repo.ts').then(m => process.stdout.write(m.longTask({modules})))"],
                          check=True, capture_output=True, text=True).stdout


def fresh_store(config, keep):
    """Fresh-install state: Jeeves's plugin store moved aside (kept in the scratch folder)."""
    moved = []
    for f in glob.glob(f"{config}/plugins/store/jeeves_*.json"):
        dst = f"{keep}/{os.path.basename(f)}.{int(time.time())}"
        shutil.move(f, dst); moved.append(dst)
    return moved


def tasks(state): return sorted(glob.glob(f"{state}/projects/*/tasks/*"))


def load(p, default):
    try: return json.load(open(p))
    except (OSError, ValueError): return default


def spend(config, repo):
    s = [transcripts.session(p) for p in transcripts.files(config, repo)]
    return round(sum(x['usd'] for x in s), 4), s


def commits(repo):
    log = subprocess.run(['git', 'log', '--format=%s'], cwd=repo, capture_output=True, text=True).stdout.splitlines()
    out = {}
    for m in log:
        k = re.match(r'module (\d+)\b', m)
        if k: out[int(k.group(1))] = out.get(int(k.group(1)), 0) + 1
    return out


def void_reason(repo, paths):
    """ST-17.2: why the run is void (one commit with several modules, or a module committed before its test file was named in any tool call), else None."""
    read = {}
    for p in paths:
        for d in transcripts.read(p):
            if d.get('type') != 'assistant': continue
            for b in (d.get('message') or {}).get('content') or []:
                if not isinstance(b, dict) or b.get('type') != 'tool_use': continue
                # Read: its test file named, or `./verify.sh n` (which prints every case); a loop's `verify.sh $n` is neither.
                s = json.dumps(b.get('input'))
                for n in re.findall(r'tests/m(\d\d)\.test\.js', s) + re.findall(r'verify\.sh\s+0*(\d+)', s):
                    at = transcripts.epoch(d.get('timestamp', ''))
                    read[int(n)] = min(read.get(int(n), at), at)
    log = subprocess.run(['git', 'log', '--reverse', '--format=@%h %ct', '--name-only'], cwd=repo, capture_output=True, text=True).stdout
    for block in log.split('@')[2:]:  # the first commit is the fixture with every stub
        head, *names = block.strip().split('\n')
        sha, ct = head.split()
        mods = sorted({int(m) for n in names for m in re.findall(r'^src/m(\d\d)\.js$', n)})
        if len(mods) > 1: return f'commit {sha} holds modules {mods}'
        for m in mods:
            if read.get(m, float('inf')) > int(ct) + 1: return f'module {m} committed ({sha}) before its test file was read'
    return None


def verify(repo):
    env = {k: v for k, v in os.environ.items() if k != 'NODE_TEST_CONTEXT'}
    # A run of it once hung for 17 minutes beside Claude's own (same .verify.log): bounded, a timeout counts as a fail.
    try: return subprocess.run(['./verify.sh'], cwd=repo, capture_output=True, text=True, env=env, timeout=300).returncode
    except subprocess.TimeoutExpired: return -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('phase', choices=['dry', '200k', 'auto', 'base'])
    ap.add_argument('scratch')
    ap.add_argument('--config-dir', required=True)
    ap.add_argument('--modules', type=int, default=1)
    ap.add_argument('--cap', type=float, required=True)
    ap.add_argument('--minutes', type=float, default=240)
    ap.add_argument('--fixture', choices=['distinct-task', 'long-task'], default='distinct-task')
    ap.add_argument('--window', type=int)
    ap.add_argument('--no-1m', action='store_true')
    a = ap.parse_args()
    sp, config = os.path.abspath(a.scratch), os.path.abspath(a.config_dir)
    out, repo, state = f"{sp}/evidence", f"{sp}/repo", f"{sp}/state"
    for d in (out, state): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    task = fixture(repo, a.modules, a.fixture)
    r = {'phase': a.phase, 'fixture': a.fixture, 'modules': a.modules, 'cap': a.cap, 'claude_version': subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()}
    if a.phase in ('dry', 'auto'): r['store_moved'] = [os.path.basename(x) for x in fresh_store(config, sp)]
    env = {'CLAUDE_CONFIG_DIR': config, 'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state}
    if a.phase == '200k': env['JEEVES_TEST_WINDOW_OVERRIDE'] = '200000'
    if a.no_1m: env['CLAUDE_CODE_DISABLE_1M_CONTEXT'] = '1'
    r['no_1m'] = a.no_1m
    debug = f"{sp}/claude-debug.log"
    args = ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', '--debug-file', debug]
    c = Claude(out, None if a.phase == 'base' else PLUGIN, repo, args, env)
    r['trust'] = c.accept_trust(); c.pump(5)
    r['recorded_before_task'] = [os.path.relpath(p, state) for p in glob.glob(f"{state}/**/*", recursive=True) if os.path.isfile(p)]
    if a.phase == '200k':
        c.line('/jeeves on'); r['on'] = c.wait(lambda: 'Jeeveson:task' in c.squeezed(4000), 30, label='/jeeves on'); c.pump(1)
    c.line(task)
    typed_at = len(c.typed)
    c.note('task typed', 'nothing more is typed')
    if a.phase in ('dry', 'auto'):
        c.wait(lambda: bool(tasks(state)), 60, label='auto task')
        sq = re.sub(r'\s', '', c.plain())
        st0 = load(f"{tasks(state)[-1]}/state.json", {}) if tasks(state) else {}
        r['first_run_notice'] = NOTICE in sq and UPGRADE not in sq
        r['auto_task'] = st0.get('origin') == 'auto'
        r['notice_screen'] = c.tail(2500)
        if not (r['first_run_notice'] and r['auto_task']) and a.phase == 'auto':
            c.note('stop', 'no first-run notice or no auto task: the run stops before spending'); r['stopped'] = 'no notice'
    deadline, last, last_cost_at, last_change = time.time() + a.minutes * 60, None, 0, time.time()
    while 'stopped' not in r and time.time() < deadline:
        if not c.pump(5): r['stopped'] = 'claude exited'; break
        t = tasks(state); s = load(f"{t[-1]}/state.json", {}) if t else {}
        lc = s.get('lastContext') or {}
        now = (s.get('status'), s.get('reason'), s.get('rotationCount'), lc.get('tokens'))
        if now != last: c.note('state', json.dumps(now)); last = now
        if len(c.buf) != getattr(c, '_n', 0): c._n = len(c.buf); last_change = time.time()
        if time.time() - last_cost_at > 60:
            last_cost_at = time.time(); usd, _ = spend(config, repo)
            c.note('spend', f"US${usd}")
            if usd > a.cap: r['stopped'] = f'cap US${a.cap} passed (US${usd})'; break
            why = void_reason(repo, transcripts.files(config, repo))
            if why: r['void'] = why; r['stopped'] = f'void: {why}'; break
        done = commits(repo)
        if len(done) >= a.modules and verify(repo) == 0 and time.time() - last_change > 30:
            r['stopped'] = 'all modules committed, verify passes'; break
        if s.get('status') in STOPS + ('COMPLETED', 'PAUSED', 'DISABLED') and time.time() - last_change > 60:
            r['stopped'] = f"task {s.get('status')} {s.get('reason')}"; break
        if a.phase == 'dry' and t and s.get('taskRevision', 0) >= 1 and time.time() - last_change > 45:
            r['stopped'] = 'dry run: answered'; break
        if time.time() - last_change > 600:
            r['stopped'] = 'screen idle 10 minutes'; break
    else:
        r.setdefault('stopped', 'time limit')
    r['keystrokes_after_task'] = c.typed[typed_at:]
    # ST-17.1's grace margin check: /context is local (no model call) and names the auto-compaction point; typed only after the run stopped.
    if a.phase == 'auto' and c.pump(1):
        mark = len(c.plain()); c.line('/context'); c.pump(4); r['context_screen'] = c.plain()[mark:][-3000:]
    c.close()
    usd, sessions = spend(config, repo)
    t = tasks(state)
    d = t[-1] if t else None
    events = [json.loads(l) for l in open(f"{d}/events.jsonl")] if d and os.path.exists(f"{d}/events.jsonl") else []
    st = load(f"{d}/state.json", {}) if d else {}
    recs = [load(p, {}) for p in sorted(glob.glob(f"{d}/sessions/*.json"))] if d else []
    window = a.window or (200_000 if a.phase == '200k' else 1_000_000)
    growth = [round((x['endPct'] - x['startPct']) * window / 100) for x in recs if x.get('endPct') is not None and x.get('startPct') is not None]
    done = commits(repo)
    calls = sum(x['calls'] for x in sessions)
    r.update(usd=usd, calls=calls, usd_per_call=round(usd / calls, 5) if calls else None,
             peak_prompt=max([x['peak_prompt'] for x in sessions] or [0]), conversations=len(sessions),
             rotations=sum(e['to'] == 'RESTORING' for e in events), final={k: st.get(k) for k in ('status', 'reason', 'origin', 'rotationCount', 'taskRevision')},
             growth_tokens=growth, module_commits=done, verify_exit=verify(repo), void=void_reason(repo, transcripts.files(config, repo)),
             retries=sum(1 for x in transcripts.files(config, repo) for l in open(x, errors='replace') if 'Jeeves: the handover is invalid' in l and '"type":"user"' in l),
             stop_events=[f"{e['to']} {e['code']}" for e in events if e['to'] in STOPS],
             events=[f"{e['from']}>{e['to']} {e['code'] or ''} {e['pct']}% {e.get('detail', '')[:70]}" for e in events],
             sessions=[{k: x[k] for k in ('file', 'calls', 'usd', 'peak_prompt')} for x in sessions])
    if d and a.phase == 'dry':
        rev = open(f"{d}/task-rev-001.md").read() if os.path.exists(f"{d}/task-rev-001.md") else ''
        r['prompt_word_for_word'] = task.strip() in rev
    if a.phase == 'auto':
        # NFR-10: no prompt text outside task-rev-* and heldPrompts.
        needle = task[:60]
        r['nfr10_hits'] = [os.path.relpath(p, state) for p in glob.glob(f"{state}/**/*", recursive=True)
                           if os.path.isfile(p) and not os.path.basename(p).startswith('task-rev-') and needle in open(p, errors='replace').read() and 'heldPrompts' not in p]
    if d: shutil.copytree(d, f"{out}/task", dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.lock', 'lock*'))
    open(f"{out}/git-log.txt", 'w').write(subprocess.run(['git', 'log', '--format=%h %s', '--reverse'], cwd=repo, capture_output=True, text=True).stdout)
    json.dump(r, open(f"{out}/result.json", 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in r.items() if k not in ('events', 'notice_screen')}, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
