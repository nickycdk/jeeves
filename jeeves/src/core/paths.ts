// POSIX path helpers (the engine has no node:path).

export function normalize(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..') }
    else out.push(part)
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.')
}

export const join = (...parts: string[]) => normalize(parts.join('/'))


/** True when `child` is `parent` or below it (both absolute, compared after normalising). */
export function isInside(child: string, parent: string): boolean {
  const c = normalize(child), pa = normalize(parent)
  return c === pa || c.startsWith(pa === '/' ? '/' : `${pa}/`)
}
