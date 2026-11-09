# Reads the engine's transcripts of a live run (ST-16.8, ST-15.2): API-equivalent cost from each assistant message's
# usage, and whether each hidden completion row (ADR-007 A1) was in the next model request after it was appended.
# On a subscription account `/cost` and the engine's cost are not dollars, so spend is computed here.
#
#   python3 tests/pty/transcripts.py <CLAUDE_CONFIG_DIR> <repo dir> [<repo dir> ...]
import glob, json, os, re, sys

# US$ per MTok, Claude Haiku 5.5 (read 2026-11-08): prompts over 100K tokens cost 5x. Cache writes: 5 min 1.25x, 1 h 2x input.
HAIKU = {'in': 0.10, 'w5m': 0.125, 'w1h': 0.20, 'read': 0.01, 'out': 0.50}
ROW = '<<<JEEVES-COMPLETE v1'


def files(config, repo):
    key = re.sub(r'[^A-Za-z0-9]', '-', os.path.realpath(repo))
    return sorted(glob.glob(f"{config}/projects/{key}/*.jsonl"), key=os.path.getmtime)


def message_cost(model, u):
    cc = u.get('cache_creation') or {}
    w1h = cc.get('ephemeral_1h_input_tokens', 0)
    w5m = cc.get('ephemeral_5m_input_tokens', u.get('cache_creation_input_tokens', 0) - w1h)
    prompt = u.get('input_tokens', 0) + u.get('cache_creation_input_tokens', 0) + u.get('cache_read_input_tokens', 0)
    k = 5 if prompt > 100_000 else 1
    usd = k * (u.get('input_tokens', 0) * HAIKU['in'] + w5m * HAIKU['w5m'] + w1h * HAIKU['w1h']
               + u.get('cache_read_input_tokens', 0) * HAIKU['read'] + u.get('output_tokens', 0) * HAIKU['out']) / 1e6
    return usd, prompt, 'haiku' in (model or '')


def epoch(ts):
    """An engine timestamp ('2026-11-09T10:00:00.123Z') as seconds; '' sorts first."""
    from datetime import datetime
    return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp() if ts else 0.0


def read(path):
    rows = []
    for line in open(path, errors='replace'):
        try: rows.append(json.loads(line))
        except ValueError: pass
    return rows


def text_of(content):
    if isinstance(content, str): return content
    return ''.join(b.get('text', '') for b in content or [] if isinstance(b, dict))


def session(path):
    rows = read(path)
    seen, usd, calls, other_models, peak = set(), 0.0, 0, set(), 0
    for d in rows:
        m = d.get('message') or {}
        if d.get('type') != 'assistant' or not m.get('usage') or m.get('id') in seen: continue
        seen.add(m.get('id')); calls += 1
        c, prompt, haiku = message_cost(m.get('model'), m['usage'])
        usd += c; peak = max(peak, prompt)
        if not haiku: other_models.add(m.get('model'))
    # Requests: messages = base request's messages[:keep] + the blobs named in tail.
    blobs = {d['hash']: d['message'] for d in rows if d.get('type') == 'api-request-blob'}
    reqs, msgs = [], {}
    for d in rows:
        if d.get('type') != 'api-request': continue
        ms = msgs.get(d.get('base'), [])[:d.get('keep', 0)] + list(d.get('tail') or [])
        msgs[d['id']] = ms
        reqs.append((d.get('timestamp', ''), d.get('querySource'), ms))
    checks = []
    for d in rows:
        m = d.get('message') or {}
        if d.get('type') != 'user' or not d.get('isMeta') or ROW not in text_of(m.get('content')): continue
        nxt = next((r for r in reqs if r[0] >= d.get('timestamp', '') and r[1] == 'repl_main_thread'), None)
        found = bool(nxt) and any(ROW in text_of((blobs.get(h) or {}).get('content')) for h in nxt[2])
        checks.append({'at': d.get('timestamp'), 'next_request': nxt[0] if nxt else None, 'row_in_it': found})
    finals = [d for d in rows if d.get('type') == 'assistant' and (d.get('message') or {}).get('stop_reason') == 'end_turn'
              and sum(b.get('type') == 'text' for b in (d['message'].get('content') or [])) > 1]
    return {'file': os.path.basename(path), 'calls': calls, 'usd': round(usd, 4), 'peak_prompt': peak,
            'other_models': sorted(x for x in other_models if x), 'rows': checks, 'multi_text_finals': len(finals)}


def main():
    config, repos = sys.argv[1], sys.argv[2:]
    out = [session(p) for r in repos for p in files(config, r)]
    print(json.dumps({'sessions': out, 'usd': round(sum(s['usd'] for s in out), 4)}, indent=1))


if __name__ == '__main__':
    main()
