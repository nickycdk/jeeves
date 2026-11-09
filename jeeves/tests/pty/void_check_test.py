# ST-17.2 (AC-55): ac41.void_reason against synthetic runs shaped like v0.3.0's void `auto-scripted` run (whose
# transcript was not kept: one Bash script implemented and committed every module, no test file was ever named).
#   python3 -I tests/pty/void_check_test.py
import json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ac41 import void_reason  # noqa: E402


def git(repo, *a, when=None):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.invalid', 'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.invalid'}
    if when: env['GIT_AUTHOR_DATE'] = env['GIT_COMMITTER_DATE'] = f'@{when} +0000'
    subprocess.run(['git', *a], cwd=repo, check=True, capture_output=True, env=env)


def repo(commits):
    """commits: [(epoch, [module numbers])]; the base commit holds every stub."""
    d = tempfile.mkdtemp()
    git(d, 'init', '-q')
    os.makedirs(f'{d}/src'); os.makedirs(f'{d}/tests')
    for n in range(1, 5):
        open(f'{d}/src/m0{n}.js', 'w').write('stub\n'); open(f'{d}/tests/m0{n}.test.js', 'w').write('t\n')
    git(d, 'add', '-A'); git(d, 'commit', '-qm', 'fixture', when=1000)
    for when, mods in commits:
        for n in mods: open(f'{d}/src/m0{n}.js', 'w').write(f'done {when}\n')
        git(d, 'add', '-A'); git(d, 'commit', '-qm', f'module {mods[0]}', when=when)
    return d


def transcript(tool_inputs):
    """tool_inputs: [(epoch, input dict)] as assistant tool_use rows."""
    from datetime import datetime, timezone
    f = tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False)
    for when, inp in tool_inputs:
        ts = datetime.fromtimestamp(when, timezone.utc).isoformat().replace('+00:00', 'Z')
        f.write(json.dumps({'type': 'assistant', 'timestamp': ts, 'message': {'id': str(when), 'content': [{'type': 'tool_use', 'name': 'Bash', 'input': inp}]}}) + '\n')
    f.close()
    return [f.name]


honest = transcript([(1100, {'file_path': 'tests/m01.test.js'}), (1300, {'command': 'cat tests/m02.test.js'})])
assert void_reason(repo([(1200, [1]), (1400, [2])]), honest) is None
assert 'holds modules [1, 2]' in void_reason(repo([(1200, [1, 2])]), honest)
# The scripted shape: one loop, a commit per module, no test file named; and a test read only after the commit.
script = transcript([(1100, {'command': 'for n in 01 02 03 04; do node gen.js $n; git commit -qam "module $n"; done'})])
assert 'module 1 committed' in void_reason(repo([(1200, [1]), (1201, [2])]), script)
assert 'module 2 committed' in void_reason(repo([(1200, [1]), (1250, [2])]), transcript([(1100, {'file_path': 'tests/m01.test.js'}), (1300, {'file_path': 'tests/m02.test.js'})]))
# Working from `./verify.sh 2`'s output counts as reading module 2's tests (review); `verify.sh $n` in a loop does not.
assert void_reason(repo([(1200, [1]), (1400, [2])]), transcript([(1100, {'command': './verify.sh 1'}), (1300, {'command': 'cd /r && ./verify.sh 02'})])) is None
# A redirect is not a module number (M10 code-review 4): `./verify.sh 2>&1` reads every module, not module 2.
assert 'module 2 committed' in void_reason(repo([(1200, [1]), (1250, [2])]), transcript([(1100, {'command': './verify.sh 1'}), (1150, {'command': './verify.sh 2>&1 | tail -5'})]))
print('void_check_test: ok')
