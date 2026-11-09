// Builds the test repositories of 06 §2 into a folder (ST-4.8). Run: node --experimental-strip-types
// tests/fixtures/build-repo.ts <fixture> <dir> [--chars <n>]. Never writes outside <dir>; never committed state.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const FIXTURES = ['clean', 'dirty', 'detached', 'worktrees', 'failing-tests', 'no-git', 'six-steps', 'long-task', 'distinct-task'] as const
export type Fixture = (typeof FIXTURES)[number]

const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', env: { ...process.env, LC_ALL: 'C' } }).toString()
function write(dir: string, files: Record<string, string>) {
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), text)
  }
}
function init(dir: string) {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'fixture')
  git(dir, 'config', 'commit.gpgsign', 'false')
}
const commitAll = (dir: string, msg: string) => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg) }

/** The six functions of `six-steps`, in order: a stub, a spec entry, a reference implementation for the case table. */
export const STEPS: readonly { name: string; spec: string; ref: (x: never) => unknown; gen: (r: () => number, i: number) => unknown }[] = [
  { name: 'double', spec: 'double(n) returns n * 2.', ref: (n: number) => n * 2, gen: r => Math.floor(r() * 2_000_000) - 1_000_000 },
  { name: 'isPalindrome', spec: 'isPalindrome(s) is true when s reads the same backwards, ignoring case and spaces.', ref: (s: string) => { const t = s.toLowerCase().replace(/\s/g, ''); return t === [...t].reverse().join('') },
    gen: (r, i) => { const w = Array.from({ length: 2 + Math.floor(r() * 6) }, () => 'abcdeAB '[Math.floor(r() * 8)]).join(''); return i % 2 ? w + [...w].reverse().join('') : w } },
  { name: 'sumDigits', spec: 'sumDigits(n) returns the sum of the decimal digits of the whole number n (sign ignored).', ref: (n: number) => [...String(Math.abs(n))].reduce((a, d) => a + Number(d), 0), gen: r => Math.floor(r() * 2e9) - 1e9 },
  { name: 'wordCount', spec: 'wordCount(s) returns the number of words separated by whitespace; an empty or blank string has 0.', ref: (s: string) => s.split(/\s+/).filter(Boolean).length,
    gen: r => Array.from({ length: Math.floor(r() * 7) }, () => (r() < 0.3 ? '  ' : ['ab', 'c', 'dd e', '\t', 'xyz'][Math.floor(r() * 5)])).join(' ') },
  { name: 'fizzbuzz', spec: 'fizzbuzz(n) returns "FizzBuzz" for multiples of 15, "Fizz" for 3, "Buzz" for 5, else String(n).', ref: (n: number) => (n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n)), gen: (_r, i) => i + 1 },
  { name: 'roman', spec: 'roman(n) returns the Roman numeral for 1 <= n <= 3999 (subtractive form: 4 is IV, 9 is IX, 40 is XL).', gen: r => 1 + Math.floor(r() * 3999),
    ref: (n: number) => { let s = ''; for (const [v, x] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) while (n >= v) { s += x; n -= v } return s } },
]

// ST-17.2: input helpers for DISTINCT's case generators.
type R = () => number
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const pick = <T>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const word = (r: R, abc = 'abcdefgh', lo = 1, hi = 6) => Array.from({ length: int(r, lo, hi) }, () => pick(r, [...abc])).join('')
const ints = (r: R, n: number, lo: number, hi: number) => Array.from({ length: n }, () => int(r, lo, hi))
const spaced = (r: R) => Array.from({ length: int(r, 0, 5) }, () => word(r, 'abcdeXYZ')).map(w => pick(r, ['', ' ', '\t']) + w).join(pick(r, [' ', '  ', ' \t ']))
const words = (s: string) => s.split(/\s+/).filter(Boolean)

/** ST-17.2 (AC-55): 40 functions with their own names and prose rules, no repeating cycle, so one script cannot do them all. */
export const DISTINCT: typeof STEPS = [
  { name: 'clampPercent', spec: 'clampPercent(n) returns n limited to the range 0 to 100: anything below 0 gives 0 and anything above 100 gives 100.', ref: (n: number) => Math.min(100, Math.max(0, n)), gen: r => int(r, -300, 400) },
  { name: 'countVowels', spec: 'countVowels(s) counts the letters a, e, i, o and u in s, in upper or lower case; y is not a vowel.', ref: (s: string) => (s.match(/[aeiou]/gi) ?? []).length, gen: r => word(r, 'abeiouyAEXz ', 0, 12) },
  { name: 'reverseWords', spec: 'reverseWords(s) returns the words of s in reverse order, joined by single spaces; any extra whitespace disappears.', ref: (s: string) => words(s).reverse().join(' '), gen: spaced },
  { name: 'isLeapYear', spec: 'isLeapYear(y) is true for years divisible by 4, except century years, which are leap years only when divisible by 400.', ref: (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0, gen: (r, i) => (i % 3 ? int(r, 1, 3000) : pick(r, [1600, 1700, 1900, 2000, 2100, 2400])) },
  { name: 'digitalRoot', spec: 'digitalRoot(n) adds up the decimal digits of the non-negative whole number n, then keeps adding up the digits of the result until a single digit is left.', ref: (n: number) => (n === 0 ? 0 : 1 + ((n - 1) % 9)), gen: r => int(r, 0, 1e9) },
  { name: 'capitalizeWords', spec: 'capitalizeWords(s) upper-cases the first letter of every word and lower-cases the rest of that word; words are separated by single spaces.', ref: (s: string) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '), gen: r => Array.from({ length: int(r, 1, 4) }, () => word(r, 'abcDEFgh')).join(' ') },
  { name: 'gcd', spec: 'gcd(pair) takes [a, b], two non-negative whole numbers that are not both zero, and returns their greatest common divisor.', ref: ([a, b]: number[]) => { while (b) [a, b] = [b, a % b]; return a }, gen: r => { const k = int(r, 1, 30); return [int(r, 0, 40) * k, int(r, 1, 40) * k] } },
  { name: 'runLength', spec: 'runLength(s) writes each run of the same character as that character followed by the length of the run, so aaab becomes a3b1; an empty string stays empty.', ref: (s: string) => s.replace(/(.)\1*/g, m => m[0] + m.length), gen: r => word(r, 'aab', 0, 12) },
  { name: 'isPowerOfTwo', spec: 'isPowerOfTwo(n) is true when the whole number n is 1, 2, 4, 8 and so on; zero and negative numbers are never powers of two.', ref: (n: number) => { if (n < 1) return false; while (n % 2 === 0) n /= 2; return n === 1 }, gen: (r, i) => (i % 2 ? 2 ** int(r, 0, 40) : int(r, -50, 5000)) },
  { name: 'secondsToClock', spec: 'secondsToClock(n) turns a number of seconds (0 or more) into H:MM:SS, with the hours unpadded and the minutes and seconds as two digits; the hours may go past 23.', ref: (n: number) => `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`, gen: r => int(r, 0, 400000) },
  { name: 'binaryOnes', spec: 'binaryOnes(n) returns how many 1 digits the non-negative whole number n has when written in binary.', ref: (n: number) => n.toString(2).split('1').length - 1, gen: r => int(r, 0, 2 ** 31) },
  { name: 'dedupe', spec: 'dedupe(list) returns the list without repeated values, keeping each value where it first appears.', ref: (a: number[]) => [...new Set(a)], gen: r => ints(r, int(r, 0, 10), 0, 6) },
  { name: 'median', spec: 'median(list) returns the middle value of a non-empty list of numbers once it is sorted; with an even count it returns the average of the two middle values.', ref: (a: number[]) => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }, gen: r => ints(r, int(r, 1, 9), -50, 50) },
  { name: 'caesar', spec: 'caesar(s) moves every letter of s three places forward in the alphabet, wrapping round from z to c, and keeps its upper or lower case; every other character is unchanged.', ref: (s: string) => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 3) % 26) + b) }), gen: r => word(r, 'abxyzXYZ !,', 0, 12) },
  { name: 'isAnagramPair', spec: 'isAnagramPair(pair) takes [a, b] and is true when the two strings use exactly the same letters the same number of times, ignoring case and spaces.', ref: ([a, b]: string[]) => { const n = (s: string) => [...s.toLowerCase().replace(/\s/g, '')].sort().join(''); return n(a) === n(b) },
    gen: (r, i) => { const w = word(r, 'abcde ', 1, 7); return [w, i % 2 ? [...w].sort(() => r() - 0.5).map(c => (r() < 0.3 ? c.toUpperCase() : c)).join('') : word(r, 'abcde', 1, 7)] } },
  { name: 'maxRun', spec: 'maxRun(list) returns the length of the longest stretch of equal values standing next to each other in the list; an empty list gives 0.', ref: (a: number[]) => { let best = 0, run = 0; a.forEach((x, i) => { run = i && a[i - 1] === x ? run + 1 : 1; best = Math.max(best, run) }); return best }, gen: r => ints(r, int(r, 0, 12), 0, 2) },
  { name: 'snakeToCamel', spec: 'snakeToCamel(s) turns snake_case into camelCase: each underscore is removed and the letter after it is upper-cased; s holds only lower-case letters with single underscores between words.', ref: (s: string) => s.replace(/_(.)/g, (_m, c: string) => c.toUpperCase()), gen: r => Array.from({ length: int(r, 1, 4) }, () => word(r, 'abcxyz')).join('_') },
  { name: 'collatzSteps', spec: 'collatzSteps(n) counts the steps needed to reach 1 from the positive whole number n, where a step halves an even number and turns an odd number m into 3m + 1; collatzSteps(1) is 0.', ref: (n: number) => { let k = 0; for (; n !== 1; k++) n = n % 2 ? 3 * n + 1 : n / 2; return k }, gen: r => int(r, 1, 10000) },
  { name: 'ordinal', spec: 'ordinal(n) returns the non-negative whole number n followed by its English ordinal suffix (1st, 2nd, 3rd, 4th); numbers ending in 11, 12 or 13 take th.', ref: (n: number) => { const t = n % 100, o = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th') }, gen: r => int(r, 0, 300) },
  { name: 'triangleKind', spec: "triangleKind(sides) takes [a, b, c], three positive lengths, and returns 'invalid' when the longest side is at least the sum of the other two; otherwise 'equilateral' when all three are equal, 'isosceles' when exactly two are, else 'scalene'.", ref: (t: number[]) => { const [a, b, c] = [...t].sort((x, y) => x - y); return c >= a + b ? 'invalid' : a === c ? 'equilateral' : a === b || b === c ? 'isosceles' : 'scalene' }, gen: r => ints(r, 3, 1, 6) },
  { name: 'rotateLeft', spec: 'rotateLeft(args) takes [list, k] and moves the list k places to the left, the items leaving the front going to the back; k may be larger than the length; an empty list stays empty.', ref: ([a, k]: [number[], number]) => (a.length ? [...a.slice(k % a.length), ...a.slice(0, k % a.length)] : []), gen: r => [ints(r, int(r, 0, 7), 0, 9), int(r, 0, 20)] },
  { name: 'hexToInt', spec: 'hexToInt(s) reads s, hexadecimal digits in upper or lower case with no prefix, and returns the number it stands for.', ref: (s: string) => parseInt(s, 16), gen: r => word(r, '0123456789abcdefABCDEF', 1, 7) },
  { name: 'initials', spec: 'initials(s) returns the first letter of each word of s, upper-cased and joined with nothing between them; words are separated by any whitespace.', ref: (s: string) => words(s).map(w => w[0].toUpperCase()).join(''), gen: spaced },
  { name: 'sumOfSquares', spec: 'sumOfSquares(n) returns 1 squared plus 2 squared and so on up to n squared, for a whole number n of 0 or more.', ref: (n: number) => (n * (n + 1) * (2 * n + 1)) / 6, gen: r => int(r, 0, 2000) },
  { name: 'isSorted', spec: 'isSorted(list) is true when no value is smaller than the one before it; empty and one-item lists count as sorted.', ref: (a: number[]) => a.every((x, i) => !i || a[i - 1] <= x), gen: (r, i) => { const a = ints(r, int(r, 0, 8), 0, 9); return i % 2 ? a.sort((x, y) => x - y) : a } },
  { name: 'zeroPad', spec: 'zeroPad(args) takes [n, width] with n a whole number of 0 or more, and returns the digits of n with zeros in front until the text is width characters long; a longer number is not cut.', ref: ([n, w]: number[]) => String(n).padStart(w, '0'), gen: r => [int(r, 0, 99999), int(r, 1, 8)] },
  { name: 'chunk', spec: 'chunk(args) takes [list, size] with size 1 or more and splits the list into groups of size items in order; the last group may be shorter.', ref: ([a, n]: [number[], number]) => Array.from({ length: Math.ceil(a.length / n) }, (_x, i) => a.slice(i * n, i * n + n)), gen: r => [ints(r, int(r, 0, 10), 0, 9), int(r, 1, 4)] },
  { name: 'mostFrequentChar', spec: 'mostFrequentChar(s) returns the character that appears most often in the non-empty string s; when several tie, the one that comes first in alphabetical order wins.', ref: (s: string) => { const c: Record<string, number> = {}; for (const x of s) c[x] = (c[x] ?? 0) + 1; return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1))[0] }, gen: r => word(r, 'abcde', 1, 12) },
  { name: 'isArmstrong', spec: 'isArmstrong(n) is true when the non-negative whole number n equals the sum of its digits, each raised to the power of how many digits n has (153 is 1 cubed plus 5 cubed plus 3 cubed).', ref: (n: number) => { const d = String(n); return [...d].reduce((a, x) => a + Number(x) ** d.length, 0) === n }, gen: (r, i) => (i % 4 ? int(r, 0, 10000) : pick(r, [0, 1, 153, 370, 371, 407, 1634, 8208, 9474])) },
  { name: 'removeVowels', spec: 'removeVowels(s) returns s with every a, e, i, o and u taken out, in upper or lower case; all other characters stay in place.', ref: (s: string) => s.replace(/[aeiou]/gi, ''), gen: r => word(r, 'abeiouAEXyz ', 0, 12) },
  { name: 'stepRange', spec: 'stepRange(args) takes [start, end, step] with step 1 or more and returns the numbers from start up to but not including end, counting by step; nothing when start is not below end.', ref: ([a, b, s]: number[]) => { const o: number[] = []; for (let x = a; x < b; x += s) o.push(x); return o }, gen: r => [int(r, -10, 10), int(r, -10, 20), int(r, 1, 5)] },
  { name: 'grade', spec: "grade(score) returns 'A' for a score of 90 or more, 'B' from 80, 'C' from 70, 'D' from 60, and 'F' below 60; scores run from 0 to 100.", ref: (n: number) => (n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F'), gen: r => int(r, 0, 100) },
  { name: 'alternateCase', spec: 'alternateCase(s) lower-cases the characters at even positions (counting from 0) and upper-cases those at odd positions; a character without case stays as it is but still takes up a position.', ref: (s: string) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''), gen: r => word(r, 'abcXYZ 1', 0, 12) },
  { name: 'countPrimes', spec: 'countPrimes(n) returns how many prime numbers are less than or equal to n, for a whole number n of 0 or more; 1 is not prime.', ref: (n: number) => { let k = 0; for (let x = 2; x <= n; x++) { let p = true; for (let d = 2; d * d <= x; d++) if (x % d === 0) { p = false; break } if (p) k++ } return k }, gen: r => int(r, 0, 2000) },
  { name: 'flattenOnce', spec: 'flattenOnce(list) returns a list in which every item that is itself a list is replaced by its items, one level deep only.', ref: (a: unknown[]) => a.flat(1), gen: r => Array.from({ length: int(r, 0, 5) }, () => pick(r, [0, 1, 2])).map(k => (k === 0 ? int(r, 0, 9) : k === 1 ? ints(r, int(r, 0, 3), 0, 9) : [int(r, 0, 9), ints(r, 2, 0, 9)])) },
  { name: 'longestWord', spec: "longestWord(s) returns the longest word of s, words being separated by whitespace; on a tie the first one wins; a blank string gives ''.", ref: (s: string) => words(s).reduce((b, w) => (w.length > b.length ? w : b), ''), gen: spaced },
  { name: 'mirrorNumber', spec: 'mirrorNumber(n) returns the whole number n with its decimal digits in reverse order, keeping its sign; zeros that end up in front disappear, so 120 becomes 21.', ref: (n: number) => (n < 0 ? -1 : 1) * Number([...String(Math.abs(n))].reverse().join('')), gen: r => int(r, -99999, 99999) },
  { name: 'intersection', spec: 'intersection(pair) takes [a, b], two lists, and returns the values found in both, each once, in the order they first appear in a.', ref: ([a, b]: number[][]) => [...new Set(a.filter(x => b.includes(x)))], gen: r => [ints(r, int(r, 0, 8), 0, 9), ints(r, int(r, 0, 8), 0, 9)] },
  { name: 'sortByLength', spec: 'sortByLength(list) returns a new list of the strings sorted by length, shortest first; strings of the same length come in alphabetical order.', ref: (a: string[]) => [...a].sort((x, y) => x.length - y.length || (x < y ? -1 : x > y ? 1 : 0)), gen: r => Array.from({ length: int(r, 0, 6) }, () => word(r, 'abcd', 0, 5)) },
  { name: 'balancedBrackets', spec: 'balancedBrackets(s) is true when every (, [ and { in s is closed by the matching ), ] or } in the right order; other characters do not matter.', ref: (s: string) => { const st: string[] = []; for (const c of s) { if ('([{'.includes(c)) st.push(c); else if (')]}'.includes(c) && st.pop() !== '([{'[')]}'.indexOf(c)]) return false } return !st.length },
    gen: (r, i) => { if (i % 2) return word(r, '()[]{}a', 0, 10); let s = ''; for (let k = int(r, 0, 4); k > 0; k--) { const p = pick(r, ['()', '[]', '{}']); s = r() < 0.5 ? p[0] + s + p[1] : s + p } return s } },
]

/** The task the E2E driver types (the only prompt). */
export const SIX_STEPS_TASK = 'Implement the six functions described in SPEC.md, strictly in order, one step at a time. Step 1 is src/step1.js with its tests in tests/step1.test.js, step 2 is src/step2.js with tests/step2.test.js, and so on up to src/step6.js with tests/step6.test.js. For each step: read its test file (its case table shows the edge cases), implement only its source file, run ./verify.sh, then commit with: git add -A && git commit -m "step 1: <function name>" (with the number of that step). Never change a step that is already committed. When all six steps are committed and ./verify.sh exits 0, the task is complete.'

/** Deterministic cases, as many as fit in `chars` characters; verify.sh prints one line per case of each implemented step. */
function caseTable(step: (typeof STEPS)[number], seed: number, chars: number): string {
  let x = seed
  const r = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const rows: string[] = []
  for (let i = 0, used = 0; used < chars; i++) {
    const input = step.gen(r, i)
    const row = `  [${JSON.stringify(input)}, ${JSON.stringify(step.ref(input as never))}],`
    rows.push(row)
    used += row.length + 1
  }
  return rows.join('\n')
}

function sixSteps(dir: string, chars: number) {
  const files: Record<string, string> = {
    'package.json': '{ "name": "six-steps", "private": true, "type": "module" }\n',
    '.gitignore': '.verify.log\n',
    'SPEC.md': ['# Six steps', '', 'Implement one function per step, in this order. Each lives in its own file (`src/step1.js` to `src/step6.js`) and has its tests beside it by number (`tests/step1.test.js` to `tests/step6.test.js`), with a table of reference cases. `./verify.sh` runs all tests; it exits 0 only when all six pass.', '',
      ...STEPS.map((s, i) => `${i + 1}. \`src/step${i + 1}.js\`: ${s.spec}`), ''].join('\n'),
    // Prints a line per case of every implemented step: ordinary test output that grows with progress (the lever).
    'verify.sh': ['#!/bin/sh', '# Runs every step\'s tests and prints each result.', 'node --test tests/*.test.js > .verify.log 2>&1', 'code=$?', 'grep -E "^ *(not )?ok |^# (tests|pass|fail)" .verify.log',
      'if [ $code -eq 0 ]; then echo "verify: all steps pass"; else echo "verify: some steps fail (expected until every step is implemented)"; fi', 'exit $code', ''].join('\n'),
  }
  STEPS.forEach((s, i) => {
    files[`src/step${i + 1}.js`] = `// Step ${i + 1}: see SPEC.md.\nexport function ${s.name}() {\n  throw new Error('not implemented')\n}\n`
    files[`tests/step${i + 1}.test.js`] = [`import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, `import { ${s.name} } from '../src/step${i + 1}.js'`, '',
      '// Reference cases: [input, expected].', 'const CASES = [', caseTable(s, 1000 + i, chars), ']', '',
      `test('step ${i + 1}: ${s.name}', async t => {`, `  assert.doesNotThrow(() => ${s.name}(CASES[0][0]), 'not implemented yet')`,
      `  for (const [input, want] of CASES) await t.test(\`case \${JSON.stringify(input)}\`, () => assert.deepEqual(${s.name}(input), want))`, '})', ''].join('\n')
  })
  write(dir, files)
  chmodSync(join(dir, 'verify.sh'), 0o755)
  init(dir)
  commitAll(dir, 'six-steps fixture')
}

/** AC-41 (ST-15.2): `long-task` has `modules` numbered modules (the six functions in turn), each checked on its own. */
export const longTask = (modules: number) => `Implement the ${modules} modules described in SPEC.md, strictly in order, one module at a time. Module 1 is src/m01.js with its tests in tests/m01.test.js, module 2 is src/m02.js with tests/m02.test.js, and so on up to src/m${pad(modules)}.js. For each module: read its test file completely (its case table shows the edge cases), implement only its source file, run ./verify.sh with the module number (for example ./verify.sh 1), then commit with: git add -A && git commit -m "module 1: <function name>" (with the number of that module). Never change a module that is already committed. When all ${modules} modules are committed and ./verify.sh with no number exits 0, the task is complete.`
const pad = (n: number) => String(n).padStart(2, '0')

// Work per module stays the same however far the task is: `./verify.sh <n>` prints one line per case of module n only.
/** `long-task` cycles through STEPS (v0.3.0's evidence); `distinct-task` takes DISTINCT in order (ST-17.2). */
function longTaskRepo(dir: string, chars: number, modules: number, distinct = false) {
  if (distinct && modules > DISTINCT.length) throw new Error(`distinct-task has at most ${DISTINCT.length} modules`)
  const mods = Array.from({ length: modules }, (_, i) => ({ n: pad(i + 1), step: distinct ? DISTINCT[i] : STEPS[i % STEPS.length], seed: 2000 + i }))
  const files: Record<string, string> = {
    'package.json': '{ "name": "long-task", "private": true, "type": "module" }\n',
    '.gitignore': '.verify.log\n',
    'SPEC.md': ['# Long task', '', `Implement one function per module, in this order. Module n lives in \`src/mNN.js\` and has its tests in \`tests/mNN.test.js\` (NN is n with two digits), with a table of reference cases. \`./verify.sh n\` runs module n's tests and prints each case; \`./verify.sh\` runs every module and prints a summary; it exits 0 only when all ${modules} pass.`, '',
      ...mods.map((m, i) => `${i + 1}. \`src/m${m.n}.js\`: ${m.step.spec}`), ''].join('\n'),
    'verify.sh': ['#!/bin/sh', '# ./verify.sh <n>: module n, every case; ./verify.sh: all modules, summary only.',
      'if [ -n "$1" ]; then f=$(printf "tests/m%02d.test.js" "$1"); node --test "$f" > .verify.log 2>&1; code=$?; grep -E "^ *(not )?ok |^# (tests|pass|fail)" .verify.log',
      'else node --test tests/*.test.js > .verify.log 2>&1; code=$?; grep -E "^# (tests|pass|fail)" .verify.log; grep -E "^not ok " .verify.log; fi',
      'if [ $code -eq 0 ]; then echo "verify: pass"; else echo "verify: fail"; fi', 'exit $code', ''].join('\n'),
  }
  for (const m of mods) {
    files[`src/m${m.n}.js`] = `// Module ${Number(m.n)}: see SPEC.md.\nexport function ${m.step.name}() {\n  throw new Error('not implemented')\n}\n`
    files[`tests/m${m.n}.test.js`] = [`import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, `import { ${m.step.name} } from '../src/m${m.n}.js'`, '',
      '// Reference cases: [input, expected].', 'const CASES = [', caseTable(m.step, m.seed, chars), ']', '',
      `test('module ${Number(m.n)}: ${m.step.name}', async t => {`, `  assert.doesNotThrow(() => ${m.step.name}(CASES[0][0]), 'not implemented yet')`,
      `  for (const [input, want] of CASES) await t.test(\`case \${JSON.stringify(input)}\`, () => assert.deepEqual(${m.step.name}(input), want))`, '})', ''].join('\n')
  }
  write(dir, files)
  chmodSync(join(dir, 'verify.sh'), 0o755)
  init(dir)
  commitAll(dir, distinct ? 'distinct-task fixture' : 'long-task fixture')
}

export function build(fixture: Fixture, dir: string, opts: { chars?: number; modules?: number } = {}): string {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const base = { 'README.md': '# fixture\n', 'src/a.js': 'export const a = 1\n' }
  switch (fixture) {
    case 'no-git': write(dir, base); break
    case 'clean': write(dir, base); init(dir); commitAll(dir, 'init'); break
    case 'dirty': write(dir, base); init(dir); commitAll(dir, 'init'); write(dir, { 'src/a.js': 'export const a = 2\n', 'new.txt': 'untracked\n' }); break
    case 'detached': write(dir, base); init(dir); commitAll(dir, 'one'); write(dir, { 'b.txt': 'b\n' }); commitAll(dir, 'two'); git(dir, 'checkout', '-q', '--detach', 'HEAD~1'); break
    case 'worktrees':
      write(dir, base); init(dir); commitAll(dir, 'init')
      // The linked worktree stays inside <dir>; excluded so the main worktree reads clean.
      writeFileSync(join(dir, '.git/info/exclude'), '.wt-feature/\n')
      git(dir, 'worktree', 'add', '-q', '-b', 'feature', join(dir, '.wt-feature')); break
    case 'failing-tests':
      write(dir, { ...base, 'package.json': '{ "name": "failing", "private": true, "scripts": { "test": "node -e \\"process.exit(1)\\"" } }\n' })
      init(dir); commitAll(dir, 'init'); break
    case 'six-steps': sixSteps(dir, opts.chars ?? 6000); break
    case 'long-task': longTaskRepo(dir, opts.chars ?? 24000, opts.modules ?? 48); break
    case 'distinct-task': longTaskRepo(dir, opts.chars ?? 24000, opts.modules ?? 18, true); break
  }
  return dir
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [fixture, dir] = process.argv.slice(2)
  const arg = (k: string) => { const at = process.argv.indexOf(k); return at > 0 ? { [k.slice(2)]: Number(process.argv[at + 1]) } : {} }
  if (!FIXTURES.includes(fixture as Fixture) || !dir) {
    console.error(`usage: build-repo.ts <${FIXTURES.join('|')}> <dir> [--chars <case table size>] [--modules <long-task or distinct-task modules>]`)
    process.exit(2)
  }
  console.log(build(fixture as Fixture, dir, { ...arg('--chars'), ...arg('--modules') }))
}
