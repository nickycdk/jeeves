# ST-8.1 / AC-01 (P layer) / AC-20: install Tibbs the way a user does, for a brand-new user (HOME is an empty scratch
# folder, so ~/.claude and the state folder start empty), check that a real interactive `claude` answers /tibbs status
# in mode full, then uninstall and compare settings. No login and no model call: /tibbs status is a local command.
#
#   python3 tests/pty/clean_install.py <scratch dir> [--out <evidence dir>]
import argparse, json, os, re, shutil, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # holds .claude-plugin/marketplace.json
sys.path.insert(0, HERE)
from ptylib import Claude  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--out')
    a = ap.parse_args()
    sp = os.path.abspath(a.scratch)
    home, work, out = f"{sp}/home", f"{sp}/work", os.path.abspath(a.out or f"{sp}/evidence")
    for d in (home, work, out): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    subprocess.run(['git', 'init', '-q'], cwd=work, check=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith('CLAUDE') and not k.startswith('TIBBS')}
    env.update(HOME=home, TERM='xterm-256color')
    log, checks = [], {}
    t0 = time.time()

    def sh(*argv):
        r = subprocess.run(argv, cwd=work, env=env, capture_output=True, text=True, timeout=180)
        log.append(f"[{time.time() - t0:6.1f}s] $ {' '.join(argv)} -> {r.returncode}\n{(r.stdout + r.stderr).strip()}")
        return r

    settings = f"{home}/.claude/settings.json"
    read = lambda: json.load(open(settings)) if os.path.exists(settings) else {}
    checks['marketplace add'] = sh('claude', 'plugin', 'marketplace', 'add', REPO).returncode == 0
    before = read()
    checks['install'] = sh('claude', 'plugin', 'install', 'tibbs@tibbs').returncode == 0
    installed = read()
    checks['install enables only tibbs@tibbs'] = {k: v for k, v in installed.items() if k != 'enabledPlugins'} == {k: v for k, v in before.items() if k != 'enabledPlugins'} and installed.get('enabledPlugins') == {**before.get('enabledPlugins', {}), 'tibbs@tibbs': True}
    seconds_to_installed = time.time() - t0

    # First start: skip the theme screen as a returning user would have; trust the folder; type /tibbs status.
    cfg = f"{home}/.claude.json"
    d = json.load(open(cfg)) if os.path.exists(cfg) else {}
    d.update(hasCompletedOnboarding=True, theme='dark')
    json.dump(d, open(cfg, 'w'))
    screen = run_claude(work, env, out)
    open(f"{out}/plain.txt", 'w').write(screen)
    squeezed = re.sub(r'\s', '', screen)
    checks['/tibbs status answers in mode full'] = 'Tibbsmode:full' in squeezed and 'Nomanagedtask' in squeezed
    state_root = f"{home}/Library/Application Support/Tibbs" if sys.platform == 'darwin' else f"{home}/.local/state/tibbs"
    checks['state folder is the OS default, outside ~/.claude'] = os.path.isdir(state_root)
    seconds_to_status = time.time() - t0
    checks['installed to /tibbs status in under 5 minutes'] = seconds_to_status < 300

    checks['uninstall'] = sh('claude', 'plugin', 'uninstall', 'tibbs@tibbs').returncode == 0
    after = read()
    checks['uninstall: settings equal to before install, except tibbs left out'] = {**after, 'enabledPlugins': {k: v for k, v in after.get('enabledPlugins', {}).items() if k != 'tibbs@tibbs'}} == {**before, 'enabledPlugins': before.get('enabledPlugins', {})}
    checks['uninstall leaves the state folder'] = os.path.isdir(state_root)
    checks['no plugin data folder holds Tibbs state'] = not os.path.exists(f"{home}/.claude/plugins/data")
    checks['repository untouched'] = subprocess.run(['git', 'status', '--porcelain'], cwd=work, capture_output=True, text=True).stdout == ''

    version = subprocess.run(['claude', '--version'], capture_output=True, text=True).stdout.strip()
    ok = all(checks.values())
    res = {'pass': ok, 'claude': version, 'checks': checks, 'seconds_to_installed': round(seconds_to_installed, 1), 'seconds_to_status': round(seconds_to_status, 1),
           'settings_before_install': before, 'settings_installed': installed, 'settings_after_uninstall': after}
    json.dump(res, open(f"{out}/result.json", 'w'), indent=2)
    open(f"{out}/commands.log", 'w').write('\n'.join(log).replace(sp, '<scratch>') + '\n')
    open(f"{out}/RESULT.md", 'w').write('\n'.join([
        f"# Clean-user install, status, uninstall: {'PASS' if ok else 'FAIL'}", '',
        f"{version} · {sys.platform} · fresh HOME (empty ~/.claude), local marketplace (the repository root), no login, no model call", '',
        f"Installed after {res['seconds_to_installed']} s; `/tibbs status` answered after {res['seconds_to_status']} s.", '',
        '| Check | Result |', '|---|---|', *[f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()], '',
        'Settings before install, installed, after uninstall:', '```json', json.dumps([before, installed, after], indent=1).replace(sp, '<scratch>'), '```', '']))
    print(open(f"{out}/RESULT.md").read())
    sys.exit(0 if ok else 1)


def run_claude(cwd, env, out):
    p = Claude(out, None, cwd, env={'HOME': env['HOME']})
    try:
        p.accept_trust()
        p.wait(lambda: 'shift+tab' in p.tail(800) or '?forshortcuts' in p.squeezed(800), 30, label='prompt')
        p.pump(2)
        p.line('/tibbs status')
        p.wait(lambda: 'Nomanagedtask' in p.squeezed(3000), 20, label='status')
    finally:
        p.close()
        try: os.kill(p.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    return p.plain()


if __name__ == '__main__':
    main()
