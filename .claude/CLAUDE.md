# App Scout: how we work in this repo

App Scout is a Claude plugin (the repository root is the plugin folder). Read README.md for what it does.

Project decisions (app type, install commands, release channels, visibility) live in `AGENTS.md`; the docs start at `docs/map.md`. Read both before a task. Keep every fact in one place: this file holds the merge and release steps, `AGENTS.md` the decisions.

## Branches

- `main`: released versions only. Users install the plugin from it. Never commit to it directly.
- `dev`: the integration branch. Every change lands here first.
- Work branches: always start from an up-to-date `dev`.
  - New feature: `feat/<short-name>`
  - Bug fix: `fix/<short-name>`
  - Tooling, docs, chores: `chore/<short-name>`

```bash
git switch dev && git pull
git switch -c feat/<short-name>
```

## Before merging a work branch into dev (every time, features and fixes alike)

1. `npm test` passes.
2. `claude plugin validate . --strict` passes.
3. **E2E with screenshots:** `node scripts/e2e.mjs` passes. It runs the real MCP server and opens the map link its tools return in two browser tabs at once (Claude's in-app browser and a normal tab share one state), runs the App Scout card in a test MCP Apps chat host (`scripts/host-harness.mjs`), and saves a screenshot of every step to `e2e-out/` with a `report.md`. Add a step to `scripts/e2e.mjs` for any new screen or behaviour the change adds, so the screenshots show the change itself.
4. Publish the evidence: `node scripts/e2e.mjs --publish` copies the run to the `e2e-evidence` branch (`<branch>/<timestamp>/`) and prints the image links.
5. Open a pull request into `dev` whose description lists what changed, the test results, and the screenshots (embedded from those links). Then merge it and delete the work branch:

```bash
gh pr create --base dev --title "<what changed>" --body-file e2e-out/pr-body.md
gh pr merge --merge --delete-branch
```

Never merge without a passing e2e run and its screenshots in the pull request.

## Issues and hotfixes

- Every bug goes on GitHub (`gh issue create`): symptom, steps to reproduce, expected vs actual, evidence, affected versions, severity, whether a release is affected. Record the lesson in `docs/failures/`.
- The user decides hotfix or normal fix. Normal: `fix/<short-name>` from `dev`. Hotfix (a released version is broken or at risk): `hotfix/<short-name>` from the latest `app-scout--v*` tag, smallest fix plus a regression test, all checks and e2e, the user approves the patch version, bump the three version files on that branch, tag it, then a pull request into `dev`. Never merge a hotfix into `main` directly and never merge `main` into `dev`.
- Merge conflicts: abort the merge and show the user the files, both sides and the options. Do not resolve them yourself.

## Previews (autonomous)

After a work branch is merged into `dev`, a preview can be tagged on that `dev` commit: `git tag -a app-scout--vX.Y.Z-preview.N -m preview && git push origin app-scout--vX.Y.Z-preview.N` (no version-file change; X.Y.Z is the next release version). Never put previews on `main`.

## After every task

Update `docs/` (feature file, harness, failures, learnings, `map.md`) in the same pull request, then report: done, open, risks, install commands, and a paste-ready prompt for any unrelated open work.

## Releases (only when the user asks)

Only when the user says to release (or to merge dev into main):

1. On `dev`, bump the version in all three places: `.claude-plugin/plugin.json`, `package.json` and `const VERSION` in `server/index.mjs`.
2. Run all the checks above, including e2e with `--publish`.
3. Open a pull request `dev` → `main` titled `Release <version>` with the changes since the last release and the screenshots, and merge it.
4. Tag the release on `main`: `claude plugin tag --push` (creates `app-scout--v<version>`).

Never bump the version or touch `main` without the user asking for a release.

## Plugin directory rules to keep

- No npm dependencies and no lockfile. Readable source, no build step, no minified code.
- Every file in the plugin under 256 KiB; images only PNG/JPEG/GIF/WebP. E2E screenshots never go on `dev` or `main` (they live on `e2e-evidence`).
- No `CLAUDE.md` at the repository root (the validator warns); project instructions live here in `.claude/CLAUDE.md`.
- Describe anything new the plugin runs, sends or stores in README.md's "What App Scout runs, sends and stores".
