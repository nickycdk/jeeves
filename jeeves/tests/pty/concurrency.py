# PTY E2E for AC-18 / ST-6.6: real `claude` processes at once in one repository, its linked worktree and a second
# repository. Only /relay commands are typed (answered locally), so no model call is made.
#
#   python3 tests/pty/concurrency.py <scratch dir> --out <evidence dir>
import argparse, glob, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    sp, out = os.path.abspath(a.scratch), os.path.abspath(a.out)
    repo, repo2, state_dir = f"{sp}/repo", f"{sp}/repo2", f"{sp}/state"
    for d in (repo, repo2, state_dir, out): shutil.rmtree(d, ignore_errors=True)
    for d in (state_dir, out): os.makedirs(d)
    build = lambda fx, d: subprocess.run(['node', '--experimental-strip-types', '--no-warnings', f"{PLUGIN}/tests/fixtures/build-repo.ts", fx, d], check=True, capture_output=True)
    build('worktrees', repo)
    build('clean', repo2)
    env = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state_dir}
    seen = lambda c, text: text in c.squeezed(6000)

    procs = {}
    for name, cwd in (('p1', repo), ('p2', repo), ('p3', f"{repo}/.wt-feature"), ('p4', repo2)):
        os.makedirs(f"{out}/{name}")
        procs[name] = Claude(f"{out}/{name}", PLUGIN, cwd, ['--debug-file', f"{sp}/{name}-debug.log"], env)
    r = {'claude_version': subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()}
    for name, c in procs.items(): r[f'{name} trust'] = c.accept_trust()
    for c in procs.values(): c.pump(3)

    p1, p2, p3, p4 = procs.values()
    p1.line('/relay on')
    r['p1 on'] = p1.wait(lambda: seen(p1, 'Jeeveson:task'), 30, label='p1 on')
    p2.line('/relay status')
    r['p2 status (read-only view of p1 task)'] = p2.wait(lambda: seen(p2, 'State:MONITORING'), 30, label='p2 status')
    p2.line('/relay on')
    r['p2 on: LOCK_HELD for p1 task, separate task'] = p2.wait(lambda: seen(p2, '(LOCK_HELD);itstaysthatsession') and seen(p2, 'Startingaseparatetask'), 30, label='p2 on')
    p2.line('/relay off')
    r['p2 off ends its own task'] = p2.wait(lambda: seen(p2, 'Jeevesoff.'), 30, label='p2 off')
    p2.line('/relay off')
    r['p2 off again: LOCK_HELD for p1 task'] = p2.wait(lambda: len(re.findall('LOCK_HELD', p2.squeezed(8000))) >= 2, 30, label='p2 off again')
    p2.line('/relay recover')
    r['p2 recover: LOCK_HELD'] = p2.wait(lambda: seen(p2, 'isstillrunning(LOCK_HELD)'), 30, label='p2 recover')
    p3.line('/relay on')
    r['p3 (linked worktree) on, no LOCK_HELD'] = p3.wait(lambda: seen(p3, 'Jeeveson:task'), 30, label='p3 on') and 'LOCK_HELD' not in p3.squeezed(6000)
    p4.line('/relay on')
    r['p4 (second repo) on, no LOCK_HELD'] = p4.wait(lambda: seen(p4, 'Jeeveson:task'), 30, label='p4 on') and 'LOCK_HELD' not in p4.squeezed(6000)
    p1.line('/relay status')
    r['p1 still owns its task (MONITORING)'] = p1.wait(lambda: len(re.findall('State:MONITORING', p1.squeezed(8000))) >= 1, 20, label='p1 status')
    for c in procs.values():
        c.line('/cost')
        c.pump(3)
    costs = {n: re.findall(r'Total cost:\s*\$(\d+\.\d+)', c.plain()) for n, c in procs.items()}
    for c in procs.values():
        try: c.close()
        except OSError: pass

    tasks = []
    for d in sorted(glob.glob(f"{state_dir}/projects/*/tasks/*")):
        s = json.load(open(f"{d}/state.json"))
        owner = None
        if os.path.exists(f"{d}/lock.d/owner.json"): owner = json.load(open(f"{d}/lock.d/owner.json"))['ownerSessionId']
        tasks.append({'project': d.split('/')[-3], 'task': s['taskId'], 'status': s['status'], 'session': s['activeSessionId'], 'lock': owner})
    projects = {t['project'] for t in tasks}
    checks = {k: bool(v) for k, v in r.items() if k != 'claude_version'}
    checks['3 project folders (repo, worktree, repo2)'] = len(projects) == 3
    checks['4 tasks, each its own session'] = len(tasks) == 4 and len({t['session'] for t in tasks}) == 4
    checks['p2 task DISABLED, others MONITORING'] = sorted(t['status'] for t in tasks) == ['DISABLED', 'MONITORING', 'MONITORING', 'MONITORING']
    checks['no model call (no cost shown or $0.00)'] = all(not v or float(v[-1]) == 0 for v in costs.values())
    lines = [f"# AC-18 concurrency (PTY): {'PASS' if all(checks.values()) else 'FAIL'}", '',
             f"Claude Code {r['claude_version']} · 4 processes at once · only /relay commands typed (no model call)", '',
             '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()], '',
             'Tasks on disk (project, task, status, session, lock owner):',
             *[f"- {t['project']} {t['task']} {t['status']} {t['session'][:8] if t['session'] else None} lock={t['lock'][:8] if t['lock'] else None}" for t in tasks],
             '', f"/cost per process: {json.dumps(costs)}", '']
    open(f"{out}/RESULT.md", 'w').write('\n'.join(lines))
    print('\n'.join(lines))
    sys.exit(0 if all(checks.values()) else 1)


if __name__ == '__main__':
    main()
