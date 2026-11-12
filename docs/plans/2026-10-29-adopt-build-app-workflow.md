# Adopt build-app-workflow — status: done
**Outcome:** the repo follows the build-app-workflow skill where it fits and keeps its own plugin flow where it does not. Acceptance: AGENTS.md and docs/ exist, `.claude/CLAUDE.md` points to them, README has a Contributing section, checks still pass.

## Options → pick
1. Adopt the skill as written (main = previews, version only in tags, `feature/` branches). Rejected: plugin users install from `main`, so previews there would ship to everyone; the validator needs the version in the files.
2. Adapt (picked): keep `main` = releases, version files and `app-scout--v` tags, `feat/` branches; add AGENTS.md, docs/, preview tags on `dev`, issue and hotfix rules.

Decisions made with the user on 2026-10-29: main = releases only; keep version files and `app-scout--v` tags; keep `feat/ fix/ chore/` and add `hotfix/`; commit AGENTS.md and docs/, keep `.claude/CLAUDE.md`.

## Unproven
- Installing a preview with `marketplace add chauvoluuhuong/app-scout@dev`: not yet run. Verify on the first preview and fix the Install line in AGENTS.md if it differs.

## E2E · Harness · Deploy · Cost
See [AGENTS.md](../../AGENTS.md#decisions) and [harness](../harness/README.md). Cost est. $0/month.

## Risks
Low: docs and rules only, no code change.

## Assumptions
- No CI workflow is added (running headless Chrome in CI and its permissions need your call); checks run locally before each merge.
- `bump_version.py` is not used until it supports the `app-scout--v` prefix.
