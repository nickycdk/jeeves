# M5 gate demo (AC-16 E layer, AC-19 E layer): a real `claude` runs six-steps; the process is killed mid-rotation
# (JEEVES_TEST_CRASH=before-clear: handover saved and verified, state ROTATING, /clear not run); a new `claude` starts,
# /relay recover is typed once the dead lock is stale, and the task continues exactly once. Git refs, stash, config and
# Claude settings files are snapshotted before and after (AC-19).
#
#   python3 tests/pty/demo_recover.py <scratch dir> --out <evidence dir> [--override +0.8] [--minutes 15]
import argparse, glob, hashlib, json, os, re, shutil, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402

# Haiku list prices per million tokens, for the killed session only (its /cost cannot be read).
PRICE = {'input_tokens': 1.0, 'output_tokens': 5.0, 'cache_read_input_tokens': 0.10, 'cache_creation_input_tokens': 1.25}


def git(repo, *args):
    return subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True).stdout


def sha(path):
    try: return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]
    except OSError: return None


def snapshot(repo):
    home = os.path.expanduser('~')
    return {
        'refs': git(repo, 'for-each-ref', '--format=%(refname) %(objectname)').splitlines(),
        'stash': git(repo, 'stash', 'list').splitlines(),
        'reflog': git(repo, 'reflog', '--format=%gs').splitlines(),
        'worktrees': git(repo, 'worktree', 'list', '--porcelain').splitlines(),
        'git_config': sha(f"{repo}/.git/config"),
        'settings': {p: sha(p) for p in (f"{home}/.claude/settings.json", f"{home}/.claude/settings.local.json", f"{repo}/.claude/settings.json", f"{repo}/.claude/settings.local.json")},
    }


def transcript(sid):
    hits = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{sid}.jsonl"))
    return [json.loads(l) for l in open(hits[0])] if hits else []


def texts(entry):
    c = (entry.get('message') or {}).get('content')
    return c if isinstance(c, str) else ''.join(b.get('text', '') for b in c or [] if isinstance(b, dict))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--out', required=True)
    ap.add_argument('--override', default='+0.8')
    ap.add_argument('--chars', default='6000')
    ap.add_argument('--minutes', type=float, default=15)
    a = ap.parse_args()
    sp, out = os.path.abspath(a.scratch), os.path.abspath(a.out)
    repo, state_dir = f"{sp}/repo", f"{sp}/state"
    for d in (repo, state_dir, out): shutil.rmtree(d, ignore_errors=True)
    for d in (state_dir, out): os.makedirs(d)
    subprocess.run(['node', '--experimental-strip-types', '--no-warnings', f"{PLUGIN}/tests/fixtures/build-repo.ts", 'six-steps', repo, '--chars', a.chars], check=True, capture_output=True)
    task = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', '-e', f"import('{PLUGIN}/tests/fixtures/build-repo.ts').then(m => process.stdout.write(m.SIX_STEPS_TASK))"],
                          check=True, capture_output=True, text=True).stdout
    before = snapshot(repo)
    env = {'JEEVES_TEST': '1', 'JEEVES_STATE_DIR': state_dir, 'JEEVES_TEST_THRESHOLD_OVERRIDE': a.override}
    args = ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash']
    r = {'claude_version': subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip(), 'override': a.override}

    def task_dir():
        d = glob.glob(f"{state_dir}/projects/*/tasks/*")
        return d[0] if d else None

    def state():
        d = task_dir()
        try: return json.load(open(f"{d}/state.json")) if d else {}
        except (OSError, ValueError): return {}

    # Process 1: runs until the crash point, then is killed (SIGKILL: no session.end, no lock release).
    os.makedirs(f"{out}/p1")
    debug1 = f"{sp}/p1-debug.log"
    p1 = Claude(f"{out}/p1", PLUGIN, repo, [*args, '--debug-file', debug1], {**env, 'JEEVES_TEST_CRASH': 'before-clear'})
    r['p1 trust'] = p1.accept_trust()
    p1.pump(4)
    p1.line('/relay on')
    r['p1 on'] = p1.wait(lambda: 'Jeeveson:task' in p1.squeezed(4000), 30, label='/relay on')
    p1.pump(1)
    p1.line('/relay check ./verify.sh')
    p1.wait(lambda: len(state().get('pendingChanges') or []) == 1, 30, label='check queued')
    p1.pump(1)
    p1.line(task)
    marker = lambda: os.path.exists(debug1) and 'jeeves: crash point before-clear' in open(debug1, errors='replace').read()
    r['p1 reached the crash point'] = p1.wait(marker, a.minutes * 60, step=2, label='crash point')
    s1 = state()
    p1_sid = s1.get('activeSessionId')
    os.kill(p1.pid, signal.SIGKILL)
    p1.note('SIGKILL', f'pid {p1.pid} at the crash point; state {s1.get("status")}')
    time.sleep(1)
    try: p1.close()
    except OSError: pass
    r['state left by the dead process'] = {k: s1.get(k) for k in ('status', 'lastValidatedHandover')} | {'step': (s1.get('rotation') or {}).get('step')}
    lock = json.load(open(f"{task_dir()}/lock.d/owner.json")) if task_dir() and os.path.exists(f"{task_dir()}/lock.d/owner.json") else None
    r['dead lock left behind'] = bool(lock and lock['ownerSessionId'] == p1_sid)

    # Process 2: a new claude in the same repo and state folder, no crash flag.
    os.makedirs(f"{out}/p2")
    debug2 = f"{sp}/p2-debug.log"
    p2 = Claude(f"{out}/p2", PLUGIN, repo, [*args, '--debug-file', debug2], env)
    p2.accept_trust()
    p2.pump(5)
    r['startup notice names the task'] = p2.wait(lambda: 'ROTATING' in p2.squeezed(6000) and 'relayrecover' in p2.squeezed(6000), 20, label='notice')
    p2.line('/relay recover')
    p2.wait(lambda: 'LOCK_HELD' in p2.squeezed(6000) or 'Recoveringtask' in p2.squeezed(6000), 30, label='first recover')
    m = re.search(r'tryagainin(\d+)s', p2.squeezed(6000))
    r['first recover refused while the lock is live (LOCK_HELD)'] = 'LOCK_HELD' in p2.squeezed(6000)
    wait = int(m.group(1)) + 3 if m else 125
    p2.note('waiting', f'{wait} s for the dead lock to go stale')
    p2.pump(wait)
    p2.line('/relay recover')
    r['second recover continues'] = p2.wait(lambda: 'Recoveringtask' in p2.squeezed(6000), 30, label='recover')
    recover_at = len(p2.typed)
    # Let the recovered session work: until a later rotation has continued, the task completes, or time runs out.
    rotations0 = state().get('rotationCount', 0)
    last, deadline = None, time.time() + a.minutes * 60
    while time.time() < deadline:
        if not p2.pump(5): break
        s = state()
        now = (s.get('status'), s.get('reason'), s.get('rotationCount'), s.get('activeSessionId'))
        if now != last: p2.note('state', json.dumps(now)); last = now
        if s.get('status') in ('COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'PAUSED', 'BLOCKED'): break
        if s.get('rotationCount', 0) >= rotations0 + 1 and s.get('status') == 'MONITORING': break
    r['keystrokes after /relay recover'] = len(p2.typed) - recover_at
    try:
        p2.pump(5)
        p2.line('/cost')
        p2.pump(4)
    except OSError:
        pass
    costs = re.findall(r'Total cost:\s*\$(\d+\.\d+)', p2.plain())
    try: p2.close()
    except OSError: pass

    d, s = task_dir(), state()
    events = [json.loads(l) for l in open(f"{d}/events.jsonl")]
    sessions = [json.load(open(p)) for p in sorted(glob.glob(f"{d}/sessions/*.json"))]
    recovered = [e for e in events if e['code'] == 'STALE_LOCK' and e['to'] == 'RESTORING']
    rec_sid = recovered[0]['sessionId'] if recovered else None
    conts = [e for e in transcript(rec_sid) if e.get('type') == 'user' and 'Jeeves: you are session' in texts(e)] if rec_sid else []
    log = git(repo, 'log', '--format=%s', '--reverse').splitlines()
    step_commits = {k: sum(1 for x in log if re.match(rf'step {k}\b', x)) for k in range(1, 7)}
    after = snapshot(repo)
    new_reflog = after['reflog'][:len(after['reflog']) - len(before['reflog'])]
    p1_cost = sum(PRICE[k] * (e.get('message', {}).get('usage') or {}).get(k, 0) for e in transcript(p1_sid) if e.get('type') == 'assistant' for k in PRICE) / 1e6 if p1_sid else None
    rest_cost = sum(x.get('costUsd', 0) for x in sessions if x['sessionId'] != p1_sid) + (float(costs[-1]) if costs else 0)
    checks = {k: bool(v) for k, v in r.items() if k not in ('claude_version', 'override', 'state left by the dead process', 'keystrokes after /relay recover')}
    checks['dead process left ROTATING with handover-001 saved'] = r['state left by the dead process']['status'] == 'ROTATING' and str(r['state left by the dead process']['lastValidatedHandover']).startswith('history/handover-001.md')
    checks['exactly one recovery (one STALE_LOCK -> RESTORING event)'] = len(recovered) == 1
    checks['exactly one continuation prompt in the recovering session'] = len(conts) == 1
    checks['continuation built from handover-001'] = bool(conts) and 'history/handover-001.md' in texts(conts[0])
    checks['no keystroke after /relay recover until the end of the run'] = r['keystrokes after /relay recover'] == 0
    checks['no step committed twice'] = all(v <= 1 for v in step_commits.values())
    checks['AC-19 stash list unchanged'] = before['stash'] == after['stash']
    checks['AC-19 refs: only refs/heads/main moved'] = [x for x in before['refs'] if not x.startswith('refs/heads/main ')] == [x for x in after['refs'] if not x.startswith('refs/heads/main ')]
    checks['AC-19 new reflog entries are commits only'] = all(x.startswith('commit') for x in new_reflog)
    checks['AC-19 .git/config and worktrees unchanged'] = before['git_config'] == after['git_config'] and before['worktrees'] == after['worktrees']
    checks['AC-19 Claude settings files unchanged'] = before['settings'] == after['settings']
    r.update(final={k: s.get(k) for k in ('status', 'reason', 'rotationCount', 'sessionSequence')}, step_commits=step_commits, git_log=log,
             new_reflog=new_reflog, before=before, after=after, cost={'killed_session_estimate': round(p1_cost or 0, 4), 'other_sessions': round(rest_cost, 4)},
             events=[f"{e['from']}>{e['to']} {e['code'] or ''} {e['pct']}% {e.get('detail', '')[:90]}" for e in events])
    for f in ('events.jsonl', 'state.json'): shutil.copy(f"{d}/{f}", out)
    for sub in ('sessions', 'history'):
        if os.path.isdir(f"{d}/{sub}"): shutil.copytree(f"{d}/{sub}", f"{out}/{sub}", dirs_exist_ok=True)
    for name, dbg in (('p1', debug1), ('p2', debug2)):
        if os.path.exists(dbg): open(f"{out}/{name}/jeeves-debug.log", 'w').writelines(l for l in open(dbg, errors='replace') if re.search(r'\(jeeves\)|\[jeeves\]|jeeves@|jeeves: ', l))
    json.dump(r, open(f"{out}/result.json", 'w'), indent=1, ensure_ascii=False)
    lines = [f"# M5 demo, kill mid-rotation -> /relay recover: {'PASS' if all(checks.values()) else 'FAIL'}", '',
             f"Claude Code {r['claude_version']} · haiku · relative override {a.override} · crash point before-clear (SIGKILL)",
             f"Cost about US${round((p1_cost or 0) + rest_cost, 4)} (killed session {round(p1_cost or 0, 4)}, estimated from its transcript at haiku list prices; other sessions {round(rest_cost, 4)})", '',
             '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()], '',
             f"State left by the dead process: {json.dumps(r['state left by the dead process'])}", f"Final state: {json.dumps(r['final'])}", '',
             'Git log:', *[f"- {x}" for x in log], '', 'New reflog entries:', *[f"- {x}" for x in new_reflog], '', 'Events:', *[f"- {e}" for e in r['events']], '']
    open(f"{out}/RESULT.md", 'w').write('\n'.join(lines))
    print('\n'.join(lines))
    sys.exit(0 if all(checks.values()) else 1)


if __name__ == '__main__':
    main()
