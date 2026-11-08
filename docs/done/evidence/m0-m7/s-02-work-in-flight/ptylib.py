# PTY driver library generalised from spike-01 drive.py.
# Runs a real interactive `claude` in a pseudo-terminal; mods log to $SRSPIKE_LOG.
import os, pty, time, select, json, re, struct, fcntl, termios, signal, subprocess

class Claude:
    def __init__(self, sp, mod, args=(), cols=140, rows=40, extra_env=None, repo=None):
        self.sp, self.log, self.rawp = sp, f"{sp}/log.jsonl", f"{sp}/raw.txt"
        self.repo = repo or f"{sp}/repo"
        env = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE') or k.startswith('CODEX'))}
        env.update(TERM='xterm-256color', SRSPIKE_LOG=self.log, **(extra_env or {}))
        argv = ['claude', '--plugin-dir', mod, '--model', 'haiku', *args]
        self.actions = []
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(self.repo)
            os.execvpe('claude', argv, env)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        self.raw = open(self.rawp, 'wb'); self.buf = b''; self.t0 = time.time()
        self.note('spawn', ' '.join(a if not a.startswith(sp) else a.replace(sp, '<scratch>') for a in argv))

    def note(self, what, detail=''):
        line = f"[{time.time()-self.t0:7.1f}s] {what} {detail}".rstrip()
        self.actions.append(line); print('[driver]', line, flush=True)

    def pump(self, sec):
        end = time.time() + sec
        while time.time() < end:
            r, _, _ = select.select([self.fd], [], [], max(0, min(0.2, end - time.time())))
            if r:
                try: d = os.read(self.fd, 65536)
                except OSError: return False
                if not d: return False
                self.raw.write(d); self.raw.flush(); self.buf += d
        return True

    def plain(self):
        return re.sub(rb'\x1b\[[0-9;?<>=]*[a-zA-Z~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]', b'', self.buf).decode('utf-8', 'replace')

    def tail(self, n=3000): return self.plain()[-n:]

    def typ(self, s, d=0.008):
        self.note('type', repr(s[:80]))
        for ch in s: os.write(self.fd, ch.encode()); self.pump(d)

    def key(self, name, b):
        self.note('key', name); os.write(self.fd, b); self.pump(0.4)

    def enter(self): self.key('Enter', b'\r')

    def rows(self):
        try: return [json.loads(l) for l in open(self.log)]
        except FileNotFoundError: return []

    def events(self): return [r['ev'] for r in self.rows()]

    def count(self, ev): return self.events().count(ev)

    def wait(self, pred, timeout, step=1.0, label=''):
        end = time.time() + timeout
        while time.time() < end:
            if pred(): return True
            self.pump(step)
        self.note('TIMEOUT', label); return False

    def selected(self):
        t = re.sub(r'\s', '', self.tail(600)); i = t.rfind('❯')
        return t[i+1:i+40] if i >= 0 else ''

    def boot(self):
        end = time.time() + 60
        while time.time() < end and 'session.start' not in self.events():
            self.pump(1)
            sq = re.sub(r'\s', '', self.tail(2500))
            if 'trustthisfolder' in sq and 'Entertoconfirm' in sq:
                for k, b in (('Down', b'\x1b[B'), ('Right', b'\x1b[C'), ('Left', b'\x1b[D'), ('Up', b'\x1b[A')):
                    if self.selected().startswith('Yes'): break
                    self.key(k, b); self.pump(0.6)
                self.note('trust dialog selected', repr(self.selected()[:30]))
                if not self.selected().startswith('Yes'): raise SystemExit('could not select Yes on trust dialog')
                self.enter(); self.pump(4)
        if 'session.start' not in self.events(): raise SystemExit('no session.start; screen: ' + self.tail(800))
        self.pump(3); return True

    def prompt(self, text):
        self.typ(text); self.pump(0.5); self.enter()

    def close(self):
        try: os.write(self.fd, b'\x03'); self.pump(1); os.write(self.fd, b'\x03'); self.pump(3)
        except OSError: pass
        try: os.kill(self.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        self.pump(2)
        open(f"{self.sp}/plain.txt", 'w').write(self.plain())
        open(f"{self.sp}/driver.log", 'w').write('\n'.join(self.actions) + '\n')

def ps_grep(pattern):
    out = subprocess.run(['ps', '-axo', 'pid,ppid,command'], capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if pattern in l and 'grep' not in l]

def fresh_repo(sp, files=None):
    repo = f"{sp}/repo"
    subprocess.run(['rm', '-rf', repo]); os.makedirs(repo)
    for p, c in (files or {'a.txt': 'hello\n'}).items():
        os.makedirs(os.path.dirname(f"{repo}/{p}") or repo, exist_ok=True)
        open(f"{repo}/{p}", 'w').write(c)
    for cmd in (['git', 'init', '-q', '-b', 'main'], ['git', 'add', '.'],
                ['git', '-c', 'user.email=s@x', '-c', 'user.name=spike', 'commit', '-qm', 'init']):
        subprocess.run(cmd, cwd=repo, check=True)
    return repo
