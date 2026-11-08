# PTY E layers for v0.2 (ST-12.4): the paths v0.1 left live-unverified, one short haiku session per phase, each in
# its own scratch JEEVES_STATE_DIR. Phases:
#   c  compaction: a typed /compact during a managed task -> a COMPACTED rotation at the next safe point
#   d  autoRecover (set through a scratch --settings file): kill mid-task, restart -> continues without /jeeves recover
#   e  REPO_MISMATCH: the repository moved between sessions -> /jeeves recover --relink continues it
#   f  the /clear stall via endedHere: NOT EXERCISED (needs the engine to withhold the fresh SessionStart)
#   g  AC-07: the threshold is crossed just before a Bash call that needs permission; the dialog stays open 20 s
#   h  the plugin's two options show in /config (no model call)
#
#   python3 tests/pty/e_layers_v2.py <scratch dir> [--out <evidence dir>] [--only c,d,...]
import argparse, glob, json, os, re, shutil, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402
from e_layers import DIALOG, build_repo, cost, idle  # noqa: E402

SETTINGS = {'pluginConfigs': {'jeeves@inline': {'options': {'autoRecover': True}}}}


class Phase:
    def __init__(self, sp, out, name):
        self.name, self.dir, self.out = name, f"{sp}/{name}", f"{out}/{name}"
        for d in (self.dir, self.out): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        self.repo, self.state = f"{self.dir}/repo", f"{self.dir}/state"
        os.makedirs(self.state)
        self.r = {'checks': {}, 'costs': []}

    def claude(self, n, args=(), env=None, repo=None):
        out = f"{self.out}/s{n}"; os.makedirs(out, exist_ok=True)
        e = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': self.state, **(env or {})}
        return Claude(out, PLUGIN, repo or self.repo, ['--permission-mode', 'default', *args], e)

    def tasks(self): return sorted(glob.glob(f"{self.state}/projects/*/tasks/*"))

    def st(self):
        t = self.tasks()
        try: return json.load(open(f"{t[-1]}/state.json")) if t else {}
        except (OSError, ValueError): return {}

    def events(self):
        t = self.tasks()
        return [json.loads(l) for l in open(f"{t[-1]}/events.jsonl")] if t and os.path.exists(f"{t[-1]}/events.jsonl") else []

    def start_task(self, c, task):
        self.r['trust'] = c.accept_trust(); c.pump(4)
        c.line('/jeeves on')
        ok = c.wait(lambda: 'Jeeveson:task' in c.squeezed(4000), 30, label='/jeeves on'); c.pump(1)
        c.line(task)
        return ok and c.wait(lambda: self.st().get('taskRevision', 0) >= 1, 30, label='task saved')

    def finish(self, c, keep_cost=True):
        if keep_cost: self.r['costs'].append(cost(c))
        c.close()

    def save(self):
        for t in self.tasks():
            dst = f"{self.out}/task-{os.path.basename(t)}"
            shutil.copytree(t, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.lock', 'lock*'))
        self.r['events'] = [f"{e['from']}>{e['to']} {e['code'] or ''} {e['pct']}% {e.get('detail', '')[:70]}" for e in self.events()]
        sessions = [json.load(open(p)) for t in self.tasks() for p in sorted(glob.glob(f"{t}/sessions/*.json"))]
        self.r['session_costs'] = [x.get('costUsd') for x in sessions]
        return self.r


def until_quiet(c, ph, pred, minutes):
    """Pump until `pred(state)` holds and the screen is idle, or the time is up."""
    end, last = time.time() + minutes * 60, None
    while time.time() < end:
        if not c.pump(3): c.note('claude exited'); return False
        s = ph.st()
        now = (s.get('status'), s.get('reason'), s.get('rotationCount'), (s.get('lastContext') or {}).get('percent'))
        if now != last: c.note('state', json.dumps(now)); last = now
        if pred(s) and idle(c, 15): return True
    c.note('TIMEOUT', 'until_quiet'); return False


def phase_c(sp, out):
    ph = Phase(sp, out, 'c'); build_repo(ph.repo)
    c = ph.claude(1, ['--allowedTools', 'Bash(wc:*)'])
    ph.start_task(c, 'Run `wc -l notes/log.txt` and tell me the number of lines. Then stop.')
    until_quiet(c, ph, lambda s: s.get('status') == 'MONITORING' and (s.get('lastContext') or {}).get('percent') is not None, 4)
    c.line('/compact')
    ok = until_quiet(c, ph, lambda s: (s.get('rotationCount') or 0) >= 1 and s.get('status') in ('MONITORING', 'CONTINUING', 'COMPLETED'), 8)
    ph.finish(c)
    ev = ph.events()
    ph.r['checks'] = {
        'c: the /compact was recorded as a COMPACTED request': any(e['to'] == 'ROTATION_REQUESTED' and e['code'] == 'COMPACTED' for e in ev),
        'c: one rotation followed (RESTORING once, handover-001 saved)': ok and sum(e['to'] == 'RESTORING' for e in ev) == 1 and bool(glob.glob(f"{ph.tasks()[-1]}/history/handover-001.md")),
    }
    return ph.save()


def phase_d(sp, out):
    ph = Phase(sp, out, 'd'); build_repo(ph.repo)
    settings = f"{ph.dir}/settings.json"; json.dump(SETTINGS, open(settings, 'w'))
    c = ph.claude(1, ['--allowedTools', 'Bash(sleep:*)', 'Bash(wc:*)'])
    ph.start_task(c, 'Run `sleep 60` with the Bash tool, then run `wc -l notes/log.txt` and tell me the number. Then stop.')
    # Kill while the sleep runs: a crash mid-task, the lock left behind.
    c.wait(lambda: 'sleep60' in c.squeezed(3000), 90, label='sleep started'); c.pump(5)
    c.note('SIGKILL', 'claude'); os.kill(c.pid, signal.SIGKILL); c.pump(2)
    c.close(); ph.r['killed_state'] = {k: ph.st().get(k) for k in ('status', 'activeSessionId')}
    # The lock is stale after 2 minutes without a heartbeat.
    time.sleep(130)
    c = ph.claude(2, ['--allowedTools', 'Bash(sleep:*)', 'Bash(wc:*)', '--settings', settings])
    c.accept_trust(); c.pump(6)
    typed_before = len(c.typed)
    ok = until_quiet(c, ph, lambda s: s.get('sessionSequence', 1) >= 2 and s.get('status') in ('MONITORING', 'CONTINUING', 'COMPLETED'), 6)
    typed = [t for t in c.typed[typed_before:]]
    ph.finish(c)
    ev = ph.events()
    ph.r['checks'] = {
        'd: the killed task was left active (not ended)': ph.r['killed_state'].get('status') == 'MONITORING',
        'd: session 2 continued it with nothing typed (autoRecover)': ok and not typed and any(e['to'] == 'RESTORING' for e in ev),
    }
    ph.r['typed_in_session_2'] = typed
    return ph.save()


def phase_e(sp, out):
    ph = Phase(sp, out, 'e'); build_repo(ph.repo)
    c = ph.claude(1, ['--allowedTools', 'Bash(git status:*)'])
    ph.start_task(c, 'Run `git status --short` and tell me how many lines it printed. Then stop.')
    until_quiet(c, ph, lambda s: s.get('status') == 'MONITORING' and (s.get('lastContext') or {}).get('percent') is not None, 4)
    ph.finish(c)
    moved = f"{ph.dir}/repo-moved"
    os.rename(ph.repo, moved); c_note = f"moved {ph.repo} -> {moved}"
    c = ph.claude(2, ['--allowedTools', 'Bash(git status:*)'], repo=moved)
    c.note('fs', c_note)
    c.accept_trust(); c.pump(6)
    ph.r['notice_moved'] = 'REPO_MISMATCH' in c.plain() or 'nolongerexists' in c.squeezed(6000)
    c.line('/jeeves recover --relink')
    ok = until_quiet(c, ph, lambda s: s.get('status') in ('MONITORING', 'CONTINUING', 'COMPLETED') and s.get('sessionSequence', 1) >= 2, 5)
    ph.finish(c)
    ev = ph.events()
    ph.r['checks'] = {
        'e: the moved task was named at session start (REPO_MISMATCH)': ph.r['notice_moved'],
        'e: /jeeves recover --relink moved it and it continued here': ok and any('moved here' in e.get('detail', '') or e['code'] == 'REPO_MISMATCH' or e['to'] == 'RESTORING' for e in ev) and len(glob.glob(f"{ph.state}/projects/*")) >= 1,
    }
    return ph.save()


def phase_g(sp, out, override):
    ph = Phase(sp, out, 'g'); build_repo(ph.repo)
    task = ('Do these three things back to back in one go, without stopping in between: read notes/log.txt completely '
            'with the Read tool (the whole file, not a search), then run exactly this Bash command: date > stamp.txt '
            ', then reply with the word DONE.')
    c = ph.claude(1, ['--allowedTools', 'Read'], {'JEEVES_TEST_THRESHOLD_OVERRIDE': override})
    ph.start_task(c, task)
    seen, ac07, end = len(c.plain()), None, time.time() + 6 * 60
    def dialog(): return re.search(DIALOG, re.sub(r'\s', '', c.plain()[seen:])) is not None
    while time.time() < end and ac07 is None:
        if not c.pump(2): break
        if dialog():
            before = ph.st(); c.note('DIALOG', 'holding it open 20 s'); c.pump(20); after = ph.st()
            ac07 = {'status_when_shown': before.get('status'), 'status_after_20s': after.get('status'), 'pct_when_shown': (before.get('lastContext') or {}).get('percent'),
                    'dialog_still_open': dialog(), 'handovers_while_open': len(glob.glob(f"{ph.tasks()[-1]}/history/handover-*.md"))}
            c.note('approve', 'Enter'); c.enter(); c.pump(3)
    ok = until_quiet(c, ph, lambda s: (s.get('rotationCount') or 0) >= 1 and s.get('status') in ('MONITORING', 'CONTINUING', 'COMPLETED', 'NEEDS_REVIEW'), 6) if ac07 else False
    ph.finish(c)
    ph.r['ac07'] = ac07
    pending = ('ROTATION_REQUESTED', 'QUIESCING')
    ph.r['checks'] = {
        'g/AC-07: a handover was pending when the permission dialog opened': bool(ac07) and ac07['status_when_shown'] in pending,
        'g/AC-07: dialog open 20 s, nothing saved or cleared meanwhile': bool(ac07) and ac07['dialog_still_open'] and ac07['handovers_while_open'] == 0 and ac07['status_after_20s'] in pending,
        'g/AC-07: the rotation followed after the answer': ok and os.path.exists(f"{ph.repo}/stamp.txt"),
    }
    return ph.save()


def phase_h(sp, out):
    ph = Phase(sp, out, 'h'); os.makedirs(ph.repo); subprocess.run(['git', 'init', '-q'], cwd=ph.repo, check=True)
    settings = f"{ph.dir}/settings.json"; json.dump(SETTINGS, open(settings, 'w'))
    c = ph.claude(1, ['--settings', settings])
    c.accept_trust(); c.pump(4)
    shots = []
    for word in ('Recover', 'State folder'):
        c.line('/config'); c.pump(4)
        mark = len(c.plain())
        c.typ(word); c.pump(3)
        shots.append(c.plain()[mark:])
        c.key('Esc', b'\x1b'); c.pump(1); c.key('Esc', b'\x1b'); c.pump(1)
    screen = '\n=====\n'.join(shots)
    open(f"{ph.out}/config-screen.txt", 'w').write(screen[-12000:])
    sq = re.sub(r'\s', '', screen)
    # The row redraws over itself ("Recover by itsel·jeeves true"): match the stable parts.
    ph.r['autoRecover_shown_true'] = re.search(r'Recoverbyitsel.{0,12}jeevestrue', sq) is not None
    ph.finish(c, keep_cost=False)
    ph.r['checks'] = {'h: /config lists both options (State folder, Recover by itself)': 'Recoverbyitsel' in sq and 'Statefolder' in sq,
                    'h: autoRecover set by the scratch --settings file shows true': ph.r['autoRecover_shown_true']}
    return ph.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--out', default=None)
    ap.add_argument('--only', default='h,c,e,g,d')
    ap.add_argument('--override', default='6', help='phase g: absolute test threshold, above a fresh session, below it plus the log')
    a = ap.parse_args()
    sp = os.path.abspath(a.scratch); out = os.path.abspath(a.out or f"{sp}/evidence"); os.makedirs(out, exist_ok=True)
    res = {'claude_version': subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()}
    runs = {'c': lambda: phase_c(sp, out), 'd': lambda: phase_d(sp, out), 'e': lambda: phase_e(sp, out), 'g': lambda: phase_g(sp, out, a.override), 'h': lambda: phase_h(sp, out)}
    for p in a.only.split(','):
        try: res[p] = runs[p]()
        except Exception as err:  # one phase failing must not lose the others' evidence
            res[p] = {'checks': {f'{p}: driver error': False}, 'error': repr(err)}
        json.dump(res, open(f"{out}/result.json", 'w'), indent=1, ensure_ascii=False)
    checks = {k: v for p in a.only.split(',') for k, v in res[p].get('checks', {}).items()}
    spend = round(sum(x for p in a.only.split(',') for x in [*res[p].get('costs', []), *res[p].get('session_costs', [])] if x), 4)
    lines = [f"# v0.2 E layers: {'PASS' if checks and all(checks.values()) else 'see FAIL rows'}", '',
             f"Claude Code {res['claude_version']} · haiku · macOS · `tests/pty/e_layers_v2.py` · cost about US${spend} (session records + /cost of the last session)", '',
             '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()],
             '| f: /clear stall via endedHere | NOT EXERCISED: needs the engine to withhold the fresh SessionStart; covered in I (`tests/mod/recover.test.ts`) |', '']
    for p in a.only.split(','):
        lines += [f"## Phase {p}", '', *[f"- {e}" for e in res[p].get('events', [])], *( [f"- error: {res[p]['error']}"] if 'error' in res[p] else []), '']
    open(f"{out}/RESULT.md", 'w').write('\n'.join(lines))
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
