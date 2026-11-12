# App Scout

<!-- build-app-workflow:begin -->
## Workflow
At the start of every task, read `~/.claude/skills/build-app-workflow/SKILL.md` and follow it. It is the single source of the workflow; this file only adds what is specific to this project.
- Workspace (private, never pushed: plans, docs, mockups): `~/app-scout-workspace/`. Store every working document there; mention files as `@workspace/<path>`.
- Before any task, read `~/app-scout-workspace/README.md` and `~/app-scout-workspace/plans/README.md`, then the plan, docs and mockups the task touches.
<!-- build-app-workflow:end -->

Docs start at [docs/map.md](docs/map.md). The merge and release steps are in [.claude/CLAUDE.md](.claude/CLAUDE.md); this file holds the decisions.

## Repos
- **app-scout** (this repo): a Claude plugin (the repository root is the plugin folder) with a local MCP server (`server/index.mjs`), a browser map and an MCP Apps card. No npm dependencies, no build step.
- No related repos. (`app-hub` sits beside it but is unrelated: App Scout uses no accounts or payments.)

## Exceptions
### Branches and releases
- Branches: `main` (released versions only, users install from it) ← `dev` ← `feat/*` | `fix/*` | `chore/*`; `hotfix/*` branches from the latest release tag.
- Preview = tag `app-scout--vX.Y.Z-preview.N` on a `dev` commit (not `main`), autonomous, no version-file change.
- Production = `dev` → `main` pull request, then `claude plugin tag --push` (`app-scout--vX.Y.Z`), only when the user asks and approves the version. The version bump is a commit on `dev`, so production is the preview plus that commit.
- Tags are `app-scout--v*`, which `bump_version.py` does not read: choose the version by hand from the Conventional Commits since the last release tag (breaking or `feat` → minor, otherwise patch, while below 1.0). Versions live in three files (`.claude-plugin/plugin.json`, `package.json`, `const VERSION` in `server/index.mjs`).
- No CI: the checks run locally before every merge (see .claude/CLAUDE.md).

### Test
`npm test` · `claude plugin validate . --strict` · e2e: `node scripts/e2e.mjs` (harness: [docs/harness/README.md](docs/harness/README.md)); `--publish` puts the screenshots on `e2e-evidence`, never on `dev` or `main`.

### Install
- Preview (the `dev` branch): on a computer without App Scout, `claude plugin marketplace add chauvoluuhuong/app-scout@dev` then `claude plugin install app-scout@app-scout`. Where the production marketplace is already added, that command is refused (the name `app-scout` is taken): run a checkout instead, `git switch dev` (or a preview tag) and `claude --plugin-dir .`.
- Production: `claude plugin marketplace add chauvoluuhuong/app-scout` then `claude plugin install app-scout@app-scout`
- Update an existing install: `claude plugin update app-scout@app-scout`

### Deploy and cost
- Deploy: none. The plugin runs on the user's computer; the marketplace is this repository. Rollback: revert on `dev`, release a patch. Infrastructure: [docs/infrastructure/README.md](docs/infrastructure/README.md).
- Cost: est. $0/month (no servers, no paid APIs; GitHub free tier).

### Visibility and security
- Repo: public (license: MIT).
- Agent files: `AGENTS.md` and `.claude/CLAUDE.md` are committed (no secrets or internal detail). No root `CLAUDE.md` (the plugin validator warns). `.claude/launch.json`, `.claude/settings.local.json` and the `workspace` link stay local.
- `docs/` is committed; keep it free of secrets and personal data. Private working notes go in the workspace.
- Secrets: none in use; never in git. Anything that would change visibility, add CI secrets or permissions, or send data to a new service: ask the user first.

### Plugin directory rules
No dependencies, files under 256 KiB, no root `CLAUDE.md`, and README's "What App Scout runs, sends and stores" kept current: see [.claude/CLAUDE.md](.claude/CLAUDE.md).
