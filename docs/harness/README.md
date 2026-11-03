# Harness
Everything runs locally on macOS or Linux with Node 18+ and Chrome (`CHROME_PATH` overrides where it is). No services, accounts or keys.

| Check | Command | Pass when |
|---|---|---|
| Unit and protocol tests (offline) | `npm test` | all green |
| Plugin validation | `claude plugin validate . --strict` | no errors or warnings |
| E2E | `node scripts/e2e.mjs` | exits 0; `e2e-out/report.md` lists every step |
| Install the latest release to try it | `npm run install:latest` | prints "already at the latest version" or updates; then start a new Claude Code session and check `/mcp` |
| E2E evidence | `node scripts/e2e.mjs --publish` | copied to `e2e-evidence/<branch>/<timestamp>/`, image links printed |

## E2E
Starts the real MCP server and opens its map link in two headless Chrome tabs sharing one state, plus the App Scout card in the test MCP Apps host (`scripts/host-harness.mjs`). It saves a screenshot per step in `e2e-out/` (git-ignored). Add a step to `scripts/e2e.mjs` for every new screen or behaviour.

## Reset
`e2e-out/` and `.dev-data/` are git-ignored; delete them to start clean.

## Evidence
Screenshots live only on the `e2e-evidence` branch, never on `dev` or `main`.
