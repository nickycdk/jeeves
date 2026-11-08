# A real interactive `claude` in a pseudo-terminal (generalised from docs/plans/evidence/m1-relay-status/ptylib.py).
# Every keystroke goes through note(), so the driver can prove what it typed and when.
import os, pty, time, select, re, struct, fcntl, termios, signal

ANSI = rb'\x1b\[[0-9;?<>=]*[a-zA-Z~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]'

class Claude:
    def __init__(self, out, plugin, repo, args=(), env=None, cols=140, rows=40):
        self.out, self.actions, self.typed = out, [], []
        clean = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE') or k.startswith('CODEX'))}
        clean.update(TERM='xterm-256color', **(env or {}))
        # plugin=None: no --plugin-dir, the installed plugin loads (clean_install.py).
        argv = ['claude', *(['--plugin-dir', plugin] if plugin else []), '--model', 'haiku', *args]
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(repo)
            os.execvpe('claude', argv, clean)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        self.raw = open(f"{out}/raw.txt", 'wb'); self.buf = b''; self.t0 = time.time()
        self.note('spawn', ' '.join(argv))

    def now(self): return time.time() - self.t0

    def note(self, what, detail=''):
        line = f"[{self.now():7.1f}s] {what} {detail}".rstrip()
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

    def plain(self): return re.sub(ANSI, b'', self.buf).decode('utf-8', 'replace')
    def tail(self, n=3000): return self.plain()[-n:]
    def squeezed(self, n=3000): return re.sub(r'\s', '', self.tail(n))

    def _send(self, what, b):
        self.typed.append((round(self.now(), 1), what)); os.write(self.fd, b)

    def typ(self, s, d=0.008):
        self.note('type', repr(s[:80]))
        for ch in s: self._send(s[:40], ch.encode()); self.pump(d)

    def key(self, name, b): self.note('key', name); self._send(name, b); self.pump(0.4)
    def enter(self): self.key('Enter', b'\r')
    def line(self, text): self.typ(text); self.pump(0.6); self.enter()

    def wait(self, pred, timeout, step=1.0, label=''):
        end = time.time() + timeout
        while time.time() < end:
            if pred(): return True
            if not self.pump(step): break
        self.note('TIMEOUT', label); return False

    def selected(self):
        t = self.squeezed(600); i = t.rfind('❯')
        return t[i+1:i+40] if i >= 0 else ''

    def accept_trust(self, timeout=90):
        """The folder-trust dialog of a new repo (before any task input)."""
        end = time.time() + timeout
        while time.time() < end:
            self.pump(1)
            sq = self.squeezed(2500)
            if 'trustthisfolder' in sq and 'Entertoconfirm' in sq:
                for k, b in (('Down', b'\x1b[B'), ('Up', b'\x1b[A'), ('Up', b'\x1b[A')):
                    if self.selected().startswith('Yes'): break
                    self.key(k, b); self.pump(0.6)
                self.enter(); self.pump(3); return True
            if '?forshortcuts' in sq or 'Try"' in sq: return True
        return False

    def close(self):
        try: os.write(self.fd, b'\x03'); self.pump(1); os.write(self.fd, b'\x03'); self.pump(3)
        except OSError: pass
        try: os.kill(self.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        self.pump(2)
        open(f"{self.out}/plain.txt", 'w').write(self.plain())
        open(f"{self.out}/driver.log", 'w').write('\n'.join(self.actions) + '\n')
