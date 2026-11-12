# Infrastructure
None to operate. The plugin runs on the user's computer; GitHub hosts the code, issues, pull requests, tags and the `e2e-evidence` branch.

| Check | How |
|---|---|
| Health | `npm test` and `node scripts/e2e.mjs` |
| Logs, usage, billing | not applicable (no servers, no paid services) |
| Deploy history / rollback | `git tag --list 'app-scout--v*'`; revert on `dev` and release a patch |

## Cost
est. $0/month — [plan](../plans/2026-10-29-adopt-build-app-workflow.md).
