# Clean-user install, status, uninstall: PASS

2.1.319 (Claude Code) · darwin · fresh HOME (empty ~/.claude), local marketplace (the repository root), no login, no model call

Installed after 1.9 s; `/jeeves status` answered after 15.2 s.

| Check | Result |
|---|---|
| marketplace add | PASS |
| install | PASS |
| install enables only jeeves@jeeves | PASS |
| /jeeves status answers in mode full | PASS |
| state folder is the OS default, outside ~/.claude | PASS |
| installed to /jeeves status in under 5 minutes | PASS |
| uninstall | PASS |
| uninstall: settings equal to before install, except jeeves left out | PASS |
| uninstall leaves the state folder | PASS |
| no plugin data folder holds Jeeves state | PASS |
| repository untouched | PASS |

Settings before install, installed, after uninstall:
```json
[
 {
  "extraKnownMarketplaces": {
   "jeeves": {
    "source": {
     "source": "directory",
     "path": "~/Desktop/Projects/jeeves"
    }
   }
  }
 },
 {
  "extraKnownMarketplaces": {
   "jeeves": {
    "source": {
     "source": "directory",
     "path": "~/Desktop/Projects/jeeves"
    }
   }
  },
  "enabledPlugins": {
   "jeeves@jeeves": true
  }
 },
 {
  "enabledPlugins": {},
  "extraKnownMarketplaces": {
   "jeeves": {
    "source": {
     "source": "directory",
     "path": "~/Desktop/Projects/jeeves"
    }
   }
  }
 }
]
```
