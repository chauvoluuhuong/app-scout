// Developer helper: run the MCP server's web side only, for testing the map page in a browser.
// Usage: node scripts/serve-dev.mjs   (prints a link to the newest session)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.CLAUDE_PLUGIN_DATA ||= join(dirname(fileURLToPath(import.meta.url)), '..', '.dev-data');
process.env.APP_SCOUT_DEV_TOKEN ||= 'dev';
const { startWeb, webInfo } = await import('../server/web/server.mjs');
const { handleAction, hasQuestions, takeQuestions } = await import('../server/actions.mjs');
const { listSessions } = await import('../server/sessions.mjs');
await startWeb(handleAction, { has: hasQuestions, take: takeQuestions });
const s = listSessions()[0];
console.log('open:', webInfo(s ? s.id : '').url);
