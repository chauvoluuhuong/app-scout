# Docs map
Read in this order: AGENTS.md → this file → the feature you are touching → its plan and failures.

| Folder | What's inside |
|---|---|
| plans/ | agreed approaches, newest first |
| features/ | what exists and how it works |
| harness/ | how to run the tests and the e2e |
| infrastructure/ | what runs where |
| failures/ | what broke, why, how to avoid it |
| releases/ | one file per production release |
| integrations/, learnings/, ideas/ | created when the first entry is needed (templates: build-app-workflow `references/docs-structure.md`) |

## Features
- [Live map](features/live-map.md) — the local server and the browser map (data set select, ask bar and chat)

## Plans
- [2026-10-29 Adopt build-app-workflow](plans/2026-10-29-adopt-build-app-workflow.md) — done

## Failures
- [2026-11-12 Typing lost; map server hardening](failures/2026-11-12-panel-typing-and-map-server.md) — panel redraws wiped typing; Origin check, bounded input, private token file · issue #16
- [2026-11-03 Card without tool calls](failures/2026-11-03-card-without-ipc.md) — the card gave up in Claude Code desktop · issue #11 · the card was removed in 0.4.0

## Integrations
The public store pages and APIs App Scout reads are listed in the README's "What App Scout runs, sends and stores".

## Releases
- [v0.4.0](releases/v0.4.0.md) — 2026-11-13
- [v0.3.3](releases/v0.3.3.md) — 2026-11-12
- [v0.3.2](releases/v0.3.2.md) — 2026-11-12
