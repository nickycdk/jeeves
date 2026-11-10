import sys; sys.path.insert(0, sys.argv[1] + '/lib')
from ptylib import Claude, fresh_repo
SP = sys.argv[1]
big = 'i=0; while [ $i -lt 1000 ]; do echo "line-$i xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; i=$((i+1)); done; echo ERR-END >&2; exit 2\n'
fresh_repo(SP, {'fail.sh': 'echo OUT-1\necho ERR-1 >&2\necho OUT-2\nprintf "progress 10%%\\rprogress 100%%\\n"\necho ERR-2 >&2\nexit 3\n', 'big.sh': big})
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(sh:*)'])
c.boot()
c.prompt('Run these two Bash commands one after the other, as separate tool calls, exactly as written: `sh fail.sh` then `sh big.sh`. Do not fix anything. Then reply DONE.')
c.wait(lambda: c.count('bash') >= 2, 150, step=2, label='bash')
c.pump(3); c.close(); print('[driver] events:', c.events())
