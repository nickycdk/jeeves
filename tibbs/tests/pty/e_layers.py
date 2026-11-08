# PTY E layers for the v0.1.0 evidence pack (ST-9.2), one live run, haiku:
#   A. AC-03: a session without /tibbs on reads past the test threshold -> no task folder, no handover request.
#   B. failing-tests fixture with a relative test threshold:
#      AC-07: the threshold is crossed just before a Bash permission dialog; the driver leaves the dialog open for 20 s
#             (nothing may rotate meanwhile), then approves it; the rotation follows afterwards.
#      AC-09: the saved handover does not call the failing `npm test` passed.
#      AC-10: after the rotation, asked without tools, Claude cannot quote a marker line it read only in session 1.
#
#   python3 tests/pty/e_layers.py <scratch dir> [--out <evidence dir>] [--minutes 20]
import argparse, glob, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402

MARKER = 'ZEBRA-7781-QX'
PENDING = ('ROTATION_REQUESTED', 'QUIESCING')
DIALOG = r'Doyouwanttoproceed|Doyouwanttomake|Doyouwanttocreate|Allowonce'
TASK = ('This is a test task with three steps; do them in order and do not skip any. '
        '1) Run `npm test` and note the result. It is expected to fail: do NOT fix it and do not edit package.json. '
        '2) This step has three parts; do them back to back, without stopping in between: read notes/log.txt completely '
        'with the Read tool (the whole file, not a search), then run `wc -l notes/log.txt`, then run exactly this Bash '
        'command: date > stamp.txt '
        '3) Write SUMMARY.md with two lines: the npm test result, and the number of lines in notes/log.txt. Then stop.')
PROBE = ('Answer without using any tools. In this conversation, can you see the contents of the file notes/log.txt? '
         'If you can, quote the line that starts with "MARKER:". If you cannot, answer exactly: NOT VISIBLE.')


def build_repo(repo):
    subprocess.run(['node', '--experimental-strip-types', '--no-warnings', f"{PLUGIN}/tests/fixtures/build-repo.ts", 'failing-tests', repo], check=True, capture_output=True)
    lines = [f"{i:05d} routine log line with nothing to act on, kept only to take up context space" for i in range(2400)]  # ~5% of a 1M-token window (haiku 5.5, run 1)
    lines.insert(1200, f"MARKER: {MARKER}")
    os.makedirs(f"{repo}/notes", exist_ok=True)
    open(f"{repo}/notes/log.txt", 'w').write('\n'.join(lines) + '\n')
    env = {**os.environ, 'GIT_AUTHOR_NAME': 'fixture', 'GIT_AUTHOR_EMAIL': 'f@x', 'GIT_COMMITTER_NAME': 'fixture', 'GIT_COMMITTER_EMAIL': 'f@x'}
    subprocess.run(['git', 'add', '-A'], cwd=repo, check=True, env=env)
    subprocess.run(['git', 'commit', '-qm', 'padding log'], cwd=repo, check=True, env=env)


def cost(c):
    try:
        c.line('/cost'); c.pump(4)
    except OSError:
        return None
    found = re.findall(r'Total cost:\s*\$(\d+\.\d+)', c.plain())
    return float(found[-1]) if found else None


def idle(c, sec):
    """True once the screen has not changed for `sec` seconds."""
    n = len(c.buf)
    c.pump(sec)
    return len(c.buf) == n


def phase_a(sp, out):
    repo, state = f"{sp}/a/repo", f"{sp}/a/state"
    for d in (state, f"{out}/a"): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    build_repo(repo)
    env = {'TIBBS_TEST': '1', 'TIBBS_STATE_DIR': state, 'TIBBS_TEST_THRESHOLD_OVERRIDE': '8'}
    c = Claude(f"{out}/a", PLUGIN, repo, ['--permission-mode', 'default', '--allowedTools', 'Read'], env)
    r = {'trust': c.accept_trust()}
    c.pump(4)
    c.line('Read notes/log.txt completely with the Read tool and tell me how many lines it has. Nothing else.')
    # Only a wait for the answer; the proof that context passed the threshold is the /context reading below.
    c.wait(lambda: re.search(r'2,?4\d\d', c.tail(1500)) is not None, 180, label='line count answer')
    c.pump(10)
    # The context fill after the read (a local command, free): shows it passed the 8% test threshold.
    mark = len(c.plain())
    c.line('/context')
    c.pump(5)
    r['context_screen'] = c.plain()[mark:][-2500:]
    open(f"{out}/a/context.txt", 'w').write(r['context_screen'])
    pct = re.search(r'tokens\s*\((\d+(?:\.\d+)?)%\)', r['context_screen'])
    r['context_pct'] = float(pct.group(1)) if pct else None
    c.key('Esc', b'\x1b'); c.pump(1)
    c.line('/tibbs status')
    c.pump(4)
    r['status_no_task'] = 'Nomanagedtask' in c.squeezed(2000)
    r['cost'] = cost(c)
    c.close()
    r['task_folders'] = glob.glob(f"{state}/projects/*/tasks/*")
    r['handover_prompt_seen'] = 'preparehandover' in re.sub(r'\s', '', c.plain()).lower()
    r['checks'] = {
        'AC-03 context passed the 8% test threshold (/context)': (r['context_pct'] or 0) >= 8,
        'AC-03 no task folder created': r['task_folders'] == [],
        'AC-03 no handover request or nudge on screen': not r['handover_prompt_seen'],
        'AC-03 /tibbs status: no managed task': r['status_no_task'],
    }
    return r


def phase_b(sp, out, minutes):
    repo, state = f"{sp}/b/repo", f"{sp}/b/state"
    for d in (state, f"{out}/b"): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    build_repo(repo)
    debug = f"{sp}/b/claude-debug.log"
    env = {'TIBBS_TEST': '1', 'TIBBS_STATE_DIR': state, 'TIBBS_TEST_THRESHOLD_OVERRIDE': '+1'}
    allowed = ['Read', 'Bash(npm test:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(wc:*)']
    c = Claude(f"{out}/b", PLUGIN, repo, ['--permission-mode', 'default', '--allowedTools', *allowed, '--debug-file', debug], env)

    def task_dir():
        d = glob.glob(f"{state}/projects/*/tasks/*")
        return d[0] if d else None

    def st():
        d = task_dir()
        try: return json.load(open(f"{d}/state.json")) if d else {}
        except (OSError, ValueError): return {}

    r = {'trust': c.accept_trust()}
    c.pump(4)
    c.line('/tibbs on')
    r['on'] = c.wait(lambda: 'Tibbson:task' in c.squeezed(4000), 30, label='/tibbs on')
    c.pump(1)
    c.line(TASK)
    r['task_saved'] = c.wait(lambda: st().get('taskRevision', 0) >= 1, 30, label='task saved')

    deadline, last, ac07, approvals = time.time() + minutes * 60, None, None, []
    # Only output after the last approval counts: an answered dialog's text stays in the scrollback.
    seen = len(c.plain())
    def dialog_open(): return re.search(DIALOG, re.sub(r'\s', '', c.plain()[seen:])) is not None
    while time.time() < deadline:
        if not c.pump(2): c.note('claude exited'); break
        s = st()
        lc = s.get('lastContext') or {}
        now = (s.get('status'), s.get('reason'), s.get('rotationCount'), lc.get('percent'))
        if now != last: c.note('state', json.dumps(now)); last = now
        if dialog_open():
            if ac07 is None:
                # AC-07: hold the dialog open, then check nothing rotated while it was open.
                before = dict(s)
                c.note('DIALOG', 'first permission dialog: holding it open 20 s')
                c.pump(20)
                after = st()
                ac07 = {
                    'status_when_shown': before.get('status'), 'status_after_20s': after.get('status'),
                    'pct_when_shown': (before.get('lastContext') or {}).get('percent'),
                    'dialog_still_open': dialog_open(),
                    'handover_files_while_open': len(glob.glob(f"{task_dir()}/history/handover-*.md")) if task_dir() else 0,
                    'screen': c.tail(800),
                }
            c.note('approve', 'Enter on the preselected Yes')
            approvals.append(round(c.now(), 1))
            c.enter(); c.pump(3)
            seen = len(c.plain())
        if not s.get('rotationCount') and s.get('status') in ('NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'PAUSED'):
            c.note('stop', f"task ended without a rotation: {s.get('status')} {s.get('reason')}"); break
        if (s.get('rotationCount') or 0) >= 1 and s.get('status') in ('MONITORING', 'COMPLETED', 'NEEDS_REVIEW') and idle(c, 25) and not dialog_open():
            break
    r['ac07'], r['approvals'] = ac07, approvals
    s = st()
    r['before_probe'] = {k: s.get(k) for k in ('status', 'reason', 'rotationCount', 'sessionSequence')}
    mark = len(c.plain())
    c.line(PROBE)
    c.wait(lambda: 'NOTVISIBLE' in re.sub(r'\s', '', c.plain()[mark:]) or MARKER in c.plain()[mark + len(PROBE) + 50:], 120, label='probe answer')
    c.pump(5)
    answer = c.plain()[mark:]
    r['probe_answer'] = answer[-1200:]
    r['cost_final_session'] = cost(c)
    c.close()

    d = task_dir()
    events = [json.loads(l) for l in open(f"{d}/events.jsonl")] if d else []
    sessions = [json.load(open(p)) for p in sorted(glob.glob(f"{d}/sessions/*.json"))] if d else []
    h1 = open(f"{d}/history/handover-001.md").read() if d and os.path.exists(f"{d}/history/handover-001.md") else ''
    tests = h1.split('## Tests and checks', 1)[1].split('\n## ', 1)[0] if '## Tests and checks' in h1 else ''
    npm_lines = [l for l in tests.splitlines() if 'npm test' in l]
    rotated_at = next((i for i, e in enumerate(events) if e['to'] == 'RESTORING'), None)
    r.update(events=[f"{e['from']}>{e['to']} {e['code'] or ''} {e['pct']}% {e.get('detail', '')[:80]}" for e in events], sessions=sessions, handover_tests=tests.strip())
    r['checks'] = {
        'AC-07 threshold request pending while the dialog was open (ROTATION_REQUESTED or QUIESCING)': bool(ac07) and ac07['status_when_shown'] in PENDING,
        'AC-07 dialog stayed open 20 s, no handover saved meanwhile': bool(ac07) and ac07['dialog_still_open'] and ac07['handover_files_while_open'] == 0 and ac07['status_after_20s'] in PENDING,
        'AC-07 rotation happened after the dialog was answered': bool(ac07) and ac07['handover_files_while_open'] == 0 and rotated_at is not None and os.path.exists(f"{repo}/stamp.txt"),
        'AC-09 handover-001 lists npm test as failed, never passed': bool(npm_lines) and all(re.search(r'fail|exit(ed)?\s*(code\s*)?1|non-?zero', l, re.I) for l in npm_lines) and not any(re.search(r'\bpass(ed|es)?\b', l, re.I) and not re.search(r'not pass|fail', l, re.I) for l in npm_lines),
        'AC-10 distinct session ids across the rotation': len({x['sessionId'] for x in sessions} | ({s['activeSessionId']} if s.get('activeSessionId') else set())) >= 2,
    }
    # The probe counts only when the handover did not carry the marker itself (it did in runs 2 and 3: Claude reports what it read).
    r['probe'] = 'inconclusive (the handover quotes the marker)' if MARKER in h1 else 'counted'
    if MARKER not in h1: r['checks']['AC-10 probe: the session-1 marker is not visible after the rotation'] = MARKER not in answer.replace(PROBE, '')
    if d:
        for f in ('events.jsonl', 'state.json'): shutil.copy(f"{d}/{f}", f"{out}/b")
        for sub in ('sessions', 'history'):
            if os.path.isdir(f"{d}/{sub}"): shutil.copytree(f"{d}/{sub}", f"{out}/b/{sub}", dirs_exist_ok=True)
    if os.path.exists(debug):
        open(f"{out}/b/tibbs-debug.log", 'w').writelines(l for l in open(debug, errors='replace') if re.search(r'\(tibbs\)|\[tibbs\]|tibbs@', l))
    r['session_costs'] = [x.get('costUsd') for x in sessions]
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--out', default=None)
    ap.add_argument('--minutes', type=float, default=20)
    ap.add_argument('--only', choices=['a', 'b'], default=None)
    a = ap.parse_args()
    sp = os.path.abspath(a.scratch)
    out = os.path.abspath(a.out or f"{sp}/evidence")
    os.makedirs(out, exist_ok=True)
    version = subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()
    res = {'claude_version': version}
    if a.only in (None, 'a'): res['a'] = phase_a(sp, out)
    if a.only in (None, 'b'): res['b'] = phase_b(sp, out, a.minutes)
    checks = {**res.get('a', {}).get('checks', {}), **res.get('b', {}).get('checks', {})}
    costs = [res.get('a', {}).get('cost'), *res.get('b', {}).get('session_costs', []), res.get('b', {}).get('cost_final_session')]
    total = round(sum(x for x in costs if x), 4)
    json.dump(res, open(f"{out}/result.json", 'w'), indent=1, ensure_ascii=False)
    b = res.get('b', {})
    lines = [f"# E layers (AC-03, AC-07, AC-09, AC-10): {'PASS' if checks and all(checks.values()) else 'FAIL'}", '',
             f"Claude Code {version} · model haiku · macOS · PTY driver `tests/pty/e_layers.py` · cost about US${total}", '',
             '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()], '',
             f"AC-10 probe: {b.get('probe', '-')}", '',
             f"AC-07 detail: {json.dumps({k: v for k, v in (b.get('ac07') or {}).items() if k != 'screen'})}", '',
             'Handover-001 "Tests and checks":', '', *[f"    {l}" for l in (b.get('handover_tests') or '(none)').splitlines()], '',
             'Probe answer (tail):', '', *[f"    {l}" for l in (b.get('probe_answer') or '').strip().splitlines()[-12:]], '',
             'Events:', *[f"- {e}" for e in b.get('events', [])], '']
    open(f"{out}/RESULT.md", 'w').write('\n'.join(lines))
    print('\n'.join(lines))
    sys.exit(0 if checks and all(checks.values()) else 1)


if __name__ == '__main__':
    main()
