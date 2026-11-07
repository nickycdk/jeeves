import sys, json; sys.path.insert(0, sys.argv[1] + '/../lib')
from ptylib import Claude, ps_grep, fresh_repo
SP = sys.argv[1]; fresh_repo(SP)
PROMPT = ('Start two background jobs, then end your turn without waiting: '
          '(1) call the Bash tool with run_in_background=true and command `sleep 45`; '
          '(2) call the Agent tool with run_in_background=true, subagent_type general-purpose, prompt "Run the Bash command sleep 30, then reply OK." '
          'After starting both, reply STARTED. When each finishes later, reply with one short line.')
c = Claude(SP, f"{SP}/mod", ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(sleep:*)'])
c.boot(); c.prompt(PROMPT)
snaps = {}
c.wait(lambda: 'boundary.defer' in c.events(), 90, label='defer')
snaps['while_deferred'] = ps_grep('sleep ')
c.note('ps while deferred', json.dumps(snaps['while_deferred']))
c.wait(lambda: 'clear.resolved' in c.events() or 'clear.rejected' in c.events(), 150, step=2, label='clear')
c.wait(lambda: 'submit.resolved' in c.events() and c.events()[c.events().index('submit.resolved'):].count('turn.complete') >= 1, 60, label='continuation')
c.pump(2)
snaps['after_rotation'] = ps_grep('sleep ')
c.note('ps after rotation', json.dumps(snaps['after_rotation']))
json.dump(snaps, open(f"{SP}/ps.json", 'w'), indent=1)
c.close(); print('[driver] events:', c.events())
