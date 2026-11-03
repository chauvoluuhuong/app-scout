# App Scout

Follow the build-app-workflow skill, adapted below. Docs start at [docs/map.md](docs/map.md). The merge and release steps are in [.claude/CLAUDE.md](.claude/CLAUDE.md); this file holds the decisions.

## Decisions
- App type: Claude plugin (the repository root is the plugin folder), with a local MCP server (`server/index.mjs`), a browser map and an MCP Apps card. No npm dependencies, no build step.
- Branches: `main` (released versions only, users install from it) ← `dev` ← `feat/*` | `fix/*` | `chore/*`; `hotfix/*` branches from the latest release tag.
- Releases: production = `dev` → `main` pull request, then `claude plugin tag --push` (`app-scout--vX.Y.Z`), only when the user asks and approves the version. Preview = tag `app-scout--vX.Y.Z-preview.N` on a `dev` commit (agent, autonomous, no version-file change).
- Versions live in three files (`.claude-plugin/plugin.json`, `package.json`, `const VERSION` in `server/index.mjs`) and are bumped only on a release. The skill's `bump_version.py` only knows `v*` tags, so choose the version by hand from the Conventional Commits since the last release tag (breaking or `feat` → minor, otherwise patch, while below 1.0).
- Test: `npm test` · `claude plugin validate . --strict` · e2e: `node scripts/e2e.mjs` (harness: [docs/harness/README.md](docs/harness/README.md)); `--publish` puts the screenshots on `e2e-evidence`.
- Deploy: none. The plugin runs on the user's computer; the marketplace is this repository. Rollback: revert on `dev`, release a patch.
- Cost: est. $0/month (no servers, no paid APIs; GitHub free tier).

## Install
- Preview: `claude plugin marketplace add chauvoluuhuong/app-scout@dev` then `claude plugin install app-scout@app-scout` (the `dev` branch; to test a tagged preview, check out the tag locally and add the marketplace from that folder).
- Production: `claude plugin marketplace add chauvoluuhuong/app-scout` then `claude plugin install app-scout@app-scout`
- Update an existing install: `claude plugin update app-scout@app-scout`

## Visibility and security
- Repo: public (license: MIT)
- Agent files (AGENTS.md, `.claude/CLAUDE.md`): committed, no secrets or internal detail. `.claude/launch.json` and `.claude/settings.local.json` stay ignored.
- Internal docs: `docs/` is committed; keep it free of secrets and personal data.
- Secrets: none in use; the plugin has no keys or accounts. Never in git.
- Anything that would change visibility, add CI secrets or permissions, or send data to a new service: ask the user first.

## Related repos
None.

## Infrastructure
None beyond GitHub: [docs/infrastructure/README.md](docs/infrastructure/README.md)

## Rules specific to this project
- Plugin directory rules (no dependencies, files under 256 KiB, no root `CLAUDE.md`, README's "What App Scout runs, sends and stores"): see [.claude/CLAUDE.md](.claude/CLAUDE.md).
- E2E screenshots never go on `dev` or `main`.
