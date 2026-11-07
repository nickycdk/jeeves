# PTY E2E (ST-4.8; AC-10, AC-11, AC-12, AC-13): a real interactive `claude` runs the `six-steps` fixture under a low
# test threshold, so the task crosses it several times. The driver types only the setup (/relay on, /relay check
# ./verify.sh, then the task prompt), then nothing until the task ends, and checks the result on disk.
#
#   npm run e2e:pty -- <scratch dir> [--override 8.5] [--chars 6000] [--minutes 30] [--out <evidence dir>]
#
# Needs `claude` on PATH and logged in; costs a few haiku turns per session (recorded in RESULT.md).
# Evidence format (06 §5): <out>/RESULT.md (assertions, cost), result.json, events.jsonl, sessions/, handovers,
# git-log.txt, driver.log (every keystroke with its time), plain.txt (the screen).
import argparse, glob, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402

TERMINAL = ('COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'PAUSED', 'DISABLED')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--override', default='8.5')
    ap.add_argument('--chars', default='6000')
    ap.add_argument('--minutes', type=float, default=30)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    sp = os.path.abspath(a.scratch)
    out = os.path.abspath(a.out or f"{sp}/evidence")
    repo, state_dir = f"{sp}/repo", f"{sp}/state"
    for d in (out, state_dir): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    build = ['node', '--experimental-strip-types', '--no-warnings', f"{PLUGIN}/tests/fixtures/build-repo.ts", 'six-steps', repo, '--chars', a.chars]
    subprocess.run(build, check=True, capture_output=True)
    task = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', '-e',
                           f"import('{PLUGIN}/tests/fixtures/build-repo.ts').then(m => process.stdout.write(m.SIX_STEPS_TASK))"],
                          check=True, capture_output=True, text=True).stdout

    env = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state_dir, 'JEEVES_TEST_THRESHOLD_OVERRIDE': a.override}
    # acceptEdits + Bash allowed: a permission dialog would need a keystroke, which the run must not need.
    # The debug file stays in the scratch folder; only Jeeves's own lines go into the evidence.
    debug = f"{sp}/claude-debug.log"
    c = Claude(out, PLUGIN, repo, ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', '--debug-file', debug], env)

    def task_dir():
        d = glob.glob(f"{state_dir}/projects/*/tasks/*")
        return d[0] if d else None

    def state():
        d = task_dir()
        try: return json.load(open(f"{d}/state.json")) if d else {}
        except (OSError, ValueError): return {}

    r = {'override': a.override, 'chars': a.chars, 'claude_version': subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()}
    r['trust'] = c.accept_trust()
    c.pump(4)
    c.line('/relay on')
    r['on'] = c.wait(lambda: 'Jeeveson:task' in c.squeezed(4000), 30, label='/relay on')
    c.pump(1)
    # The check goes before the prompt: a command typed while Claude works waits for the turn to end (debug run 1).
    c.line('/relay check ./verify.sh')
    r['check_queued'] = c.wait(lambda: len(state().get('pendingChanges') or []) == 1, 30, label='check queued')
    c.pump(1)
    c.line(task)
    r['check_saved'] = c.wait(lambda: state().get('taskRevision', 0) >= 2, 30, label='task and check saved')
    setup_end = c.now()
    typed_at_setup = len(c.typed)
    c.note('setup done', f'{typed_at_setup} keystrokes; none allowed from here')

    last, deadline = None, time.time() + a.minutes * 60
    dialog = None
    while time.time() < deadline:
        if not c.pump(5): c.note('claude exited'); break
        s = state()
        lc = s.get('lastContext') or {}
        now = (s.get('status'), s.get('reason'), s.get('rotationCount'), s.get('activeSessionId'), lc.get('percent'), lc.get('tokens'))
        if now != last: c.note('state', json.dumps(now)); last = now
        if s.get('status') in TERMINAL: break
        if re.search(r'Doyouwanttoproceed|Doyouwanttomake|Allowonce', c.squeezed(1500)) and not dialog:
            dialog = c.tail(600); c.note('DIALOG', 'a permission dialog is open; the driver does not answer it')
    run_end = c.now()
    r['keystrokes_after_setup'] = [t for t in c.typed[typed_at_setup:] if t[0] <= run_end]
    r['dialog'] = dialog
    # After the run (not part of it): the last conversation's cost (each /clear starts the counter over, S-04).
    try:
        c.pump(8)
        c.line('/cost')
        c.pump(4)
    except OSError:
        c.note('claude already exited; no /cost')
    costs = re.findall(r'Total cost:\s*\$(\d+\.\d+)', c.plain())
    r['final_session_cost'] = float(costs[-1]) if costs else None
    try: c.close()
    except OSError: pass

    d, s = task_dir(), state()
    r['final'] = {k: s.get(k) for k in ('status', 'reason', 'rotationCount', 'sessionSequence', 'taskRevision', 'mode', 'lastErrorCode')}
    events = [json.loads(l) for l in open(f"{d}/events.jsonl")] if d else []
    sessions = [json.load(open(p)) for p in sorted(glob.glob(f"{d}/sessions/*.json"))] if d else []
    ids = [x['sessionId'] for x in sessions] + [s.get('activeSessionId')]
    log = subprocess.run(['git', 'log', '--format=%s', '--reverse'], cwd=repo, capture_output=True, text=True).stdout.splitlines()
    touched = {k: len(subprocess.run(['git', 'log', '--format=%h', '--', f'src/step{k}.js'], cwd=repo, capture_output=True, text=True).stdout.split()) - 1 for k in range(1, 7)}
    verify_env = {k: v for k, v in os.environ.items() if k != 'NODE_TEST_CONTEXT'}
    verify = subprocess.run(['./verify.sh'], cwd=repo, capture_output=True, text=True, env=verify_env).returncode
    step_commits = {k: sum(1 for m in log if re.match(rf'step {k}\b', m)) for k in range(1, 7)}
    session_cost = sum(x.get('costUsd', 0) for x in sessions)

    checks = {
        'AC-10/12 rotations >= 2': sum(1 for e in events if e['to'] == 'RESTORING') >= 2,
        'AC-10 distinct session ids (>= 3)': len(ids) >= 3 and len(set(ids)) == len(ids),
        'AC-10 each session start% < end%': all(x['startPct'] is not None and x['endPct'] is not None and x['startPct'] < x['endPct'] for x in sessions) and len(sessions) >= 2,
        'AC-11 zero keystrokes after setup': r['keystrokes_after_setup'] == [],
        'AC-11 no permission dialog': dialog is None,
        'AC-12 each step committed exactly once': all(v == 1 for v in step_commits.values()),
        'AC-12 each step file changed in exactly one commit': all(v == 1 for v in touched.values()),
        'AC-12 task revision unchanged (rev 1 + the check)': s.get('taskRevision') == 2,
        'final ./verify.sh exits 0': verify == 0,
        'AC-13 COMPLETED': s.get('status') == 'COMPLETED',
    }
    r.update(checks=checks, step_commits=step_commits, step_files_touched=touched, git_log=log, sessions=sessions,
             events=[f"{e['from']}>{e['to']} {e['code'] or ''} {e['pct']}% {e.get('detail', '')[:80]}" for e in events],
             setup_seconds=round(setup_end, 1), run_seconds=round(run_end - setup_end, 1),
             cost_usd={'sessions_before_final': round(session_cost, 4), 'final_session': r['final_session_cost'],
                       'total': round(session_cost + (r['final_session_cost'] or 0), 4)})
    if d:
        for f in ('events.jsonl', 'state.json'): shutil.copy(f"{d}/{f}", out)
        for sub in ('sessions', 'history'):
            if os.path.isdir(f"{d}/{sub}"): shutil.copytree(f"{d}/{sub}", f"{out}/{sub}", dirs_exist_ok=True)
    open(f"{out}/git-log.txt", 'w').write('\n'.join(log) + '\n')
    if os.path.exists(debug):
        # Jeeves's own markers only: the scratch path itself contains "jeeves".
        open(f"{out}/jeeves-debug.log", 'w').writelines(l for l in open(debug, errors='replace') if re.search(r'\(jeeves\)|\[jeeves\]|jeeves@', l))
    json.dump(r, open(f"{out}/result.json", 'w'), indent=1, ensure_ascii=False)
    lines = [f"# PTY E2E six-steps: {'PASS' if all(checks.values()) else 'FAIL'}", '',
             f"Claude Code {r['claude_version']} · model haiku · threshold override {a.override}% · case tables {a.chars} chars per step",
             f"Setup {r['setup_seconds']} s, run {r['run_seconds']} s · cost about US${r['cost_usd']['total']} (sessions {r['cost_usd']['sessions_before_final']} + final {r['cost_usd']['final_session']})", '',
             '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()], '',
             f"Final state: {json.dumps(r['final'])}", '', 'Sessions:', *[f"- {x['sessionId'][:8]} {x['startPct']}% -> {x['endPct']}% (US${x.get('costUsd')})" for x in sessions],
             '', 'Git log:', *[f"- {m}" for m in log], '', 'Events:', *[f"- {e}" for e in r['events']], '']
    open(f"{out}/RESULT.md", 'w').write('\n'.join(lines))
    print('\n'.join(lines))
    sys.exit(0 if all(checks.values()) else 1)


if __name__ == '__main__':
    main()
