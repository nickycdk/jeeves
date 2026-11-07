import os, pty, sys, time, select, json, re, struct, fcntl, termios, signal
SP = sys.argv[1]; PROMPT = sys.argv[2] if len(sys.argv) > 2 else 'Reply with exactly the word ALPHA.'
LOG = f"{SP}/log.jsonl"; RAW = f"{SP}/raw.txt"
env = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE') or k.startswith('CODEX'))}
env['TERM'] = 'xterm-256color'
pid, fd = pty.fork()
if pid == 0:
    os.chdir(f"{SP}/repo")
    os.execvpe('claude', ['claude', '--plugin-dir', f"{SP}/mod", '--model', 'haiku', '--permission-mode', 'acceptEdits'], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 140, 0, 0))
raw = open(RAW, 'wb'); buf = b''
def pump(sec):
    global buf
    end = time.time() + sec
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try: d = os.read(fd, 65536)
            except OSError: return False
            if not d: return False
            raw.write(d); raw.flush(); buf += d
    return True
def plain(): return re.sub(rb'\x1b\[[0-9;?<>=]*[a-zA-Z~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]', b'', buf).decode('utf-8', 'replace')
def typ(s, d=0.04):
    for ch in s: os.write(fd, ch.encode()); pump(d)
def events():
    try: return [json.loads(l)['ev'] for l in open(LOG)]
    except FileNotFoundError: return []
pump(6)
if 'trust this folder' in plain(): print('[driver] trust dialog -> Yes'); os.write(fd, b'\x1b[B'); pump(0.5); os.write(fd, b'\r'); pump(6)
t0 = time.time()
while time.time() - t0 < 40 and not ('session.start' in events() and 'Try "' in plain()[-4000:]): pump(1)
pump(2); print('[driver] ready; events:', events())
typ(PROMPT); pump(0.5); os.write(fd, b'\r')
t0 = time.time(); dialog_at = None; esc_sent = False
while time.time() - t0 < 180:
    pump(2)
    ev = events(); tail = plain()[-3000:]
    if dialog_at is None and 'Esc to cancel' in tail and 'turn.complete' in ev:
        dialog_at = time.time(); print('[driver] modal dialog visible after turn; events:', ev)
    if dialog_at and not esc_sent and time.time() - dialog_at > 20:
        print('[driver] 20s with dialog; events:', events(), '-> Esc'); os.write(fd, b'\x1b'); esc_sent = True
    if 'submit.resolved' in ev and ev[ev.index('submit.resolved'):].count('turn.complete') >= 1: break
    if 'clear.rejected' in ev or 'submit.rejected' in ev: break
pump(3)
print('[driver] events:', events())
typ('/compact'); pump(1.5); os.write(fd, b'\r'); pump(12)
print('[driver] after /compact:', events()); print('[driver] screen tail:', plain()[-600:].replace(chr(10),' | '))
os.write(fd, b'\x03'); pump(1); os.write(fd, b'\x03'); pump(4)
try: os.kill(pid, signal.SIGTERM)
except ProcessLookupError: pass
pump(2)
open(f"{SP}/plain.txt", 'w').write(plain())
