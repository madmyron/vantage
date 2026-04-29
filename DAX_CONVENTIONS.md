# Dax Conventions & Architecture

Everything learned the hard way. Read this before adding features to Dax or its edge functions.

---

## How Dax Works (The Full Loop)

1. User talks to Dax in the chat panel
2. `dax-chat` edge function calls Claude Haiku and returns a reply
3. Dax's reply may contain `[EXECUTE:{...}]` blocks — structured instructions for code changes
4. The frontend parses those blocks and shows **one approval card** for the whole batch
5. User clicks Approve → frontend calls `dax-execute` for each file in sequence
6. `dax-execute` reads the file from GitHub, calls Claude Sonnet to write/modify it, commits back to GitHub
7. Frontend waits 2 seconds, then calls `dax-verify`
8. `dax-verify` re-reads the committed file from GitHub, asks Claude Haiku if the change landed, optionally checks the live Vercel URL
9. Result is reported back to the user in chat

---

## Edge Functions

Three Supabase edge functions. All deployed to project `qkjzanjtneiilsgctvxe`.

| Function | Model | Purpose |
|---|---|---|
| `dax-chat` | claude-haiku-4-5-20251001 | Conversation, planning, EXECUTE block generation |
| `dax-execute` | claude-sonnet-4-6 | Reads file from GitHub, writes modified version, commits it |
| `dax-verify` | claude-haiku-4-5-20251001 | Confirms the change actually landed in GitHub |

---

## Token Limits — CRITICAL

**`dax-execute` max_tokens must be 16000. Do not increase it.**

- `max_tokens: 32000` → immediate 500 error (API rejects it for this model/SDK combo)
- `max_tokens: 64000` → same, immediate 500 error
- `max_tokens: 16000` → works reliably
- SDK version is `npm:@anthropic-ai/sdk@0.39.0` — older versions have lower model output caps

If you need to handle larger files, break the task into smaller files instead of raising the token limit.

---

## Code Generation Rules (dax-execute prompts)

Claude will write bloated, over-commented, verbose code by default. The prompt must constrain it.

**Always include in the prompt:**
- "Write concise, minimal code"
- "No comments, no verbose error handling, no padding"
- "Stay under 200 lines"
- "Return ONLY the raw file content, no markdown, no explanation"

**For new files:**
```
You are a precise code writer. Create the file described below. Write concise, minimal code — no comments, no verbose error handling, no padding. Stay under 200 lines. Return ONLY the raw file content, no markdown, no explanation.

File: {path}
Task: {technicalDescription}

Return only the file content.
```

**For existing files:**
```
You are a precise code editor. Apply the change below. Return the complete modified file with no markdown, no explanation — just raw file content.

File: {path}

Existing content:
{fileData.content}

Change: {technicalDescription}

Return only the complete modified file.
```

---

## Code Fence Stripping

Claude sometimes wraps output in markdown fences even when told not to. Always strip them:

```typescript
const cleaned = raw
  .replace(/^```[\w]*[ \t]*\r?\n/, "")   // strip opening fence
  .replace(/\r?\n```[ \t]*$/, "")          // strip closing fence
  .trim();
```

The `[ \t]*` handles trailing spaces after the language tag (e.g. ` ```javascript   `).

---

## GitHub Commit Flow

**Fetch before commit** — you need the file's SHA to update it. New files have no SHA.

```typescript
// Fetch existing file (returns null if doesn't exist)
const fileData = await fetchFile(repo, filePath, token);
const isNewFile = !fileData;

// Commit — omit sha for new files, include it for updates
const body = { message, content: encoded };
if (sha) body.sha = sha;  // DO NOT send sha for new files — it will fail
```

**Encoding:** Use `btoa(unescape(encodeURIComponent(content)))` for the file content. This handles UTF-8 characters correctly.

---

## EXECUTE Block Format

Dax embeds structured commands in its chat responses using this format:

```
[EXECUTE:{"projectName":"Aria","title":"Fix X","description":"Plain English","technicalDescription":"Detailed instructions for Claude","files":["src/path/to/file.js"]}]
```

The frontend uses a **brace-counting parser** (not regex) to extract these blocks because `files` contains a JSON array with `]` inside it, which breaks naive regex matching.

Other block types:
- `[PIP:{...}]` — creates a new task card
- `[MOVE_PIP:{...}]` — moves a task to a different stage

---

## Error Handling

**Getting the real error from a Supabase edge function:**

The default Supabase client error message is always "Edge Function returned a non-2xx status code" — useless. Do this instead:

```javascript
async function executePip(repo, pip) {
  const { data, error } = await sb.functions.invoke('dax-execute', {
    body: { repo, pip },
  });
  if (error) {
    let msg = error.message || 'dax-execute failed';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return data;
}
```

**Always add `console.error` in edge function catch blocks** — it appears in Supabase edge function logs:

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("dax-execute error:", msg);
  return new Response(JSON.stringify({ error: msg }), { status: 500, ... });
}
```

---

## Conversation History

- Stored in `dax_history` Supabase table (columns: `id`, `role`, `content`, `conversation_id`, `conversation_title`, `created_at`)
- Hard reset (Clear button) clears the **visual chat only** — history is preserved in DB for context
- New button starts a fresh conversation with a new `conversationId`
- History menu shows past conversations
- Filter out JSON blobs before saving to history — use `looksLikeJson()` check

---

## Dax System Prompt Rules

- Dax is Haiku, not Sonnet — keep context lean
- Do NOT pass `pendingReview`, `pendingQueue`, or other orchestration state to `dax-chat` — it will trigger review mode for all normal messages
- Only pass: `activeProject` (name only), `conversationId`, `conversationTitle`
- Full project data, PIPs, finances, team go in the system prompt as JSON — not as context fields

## callDaxChat Payload — CRITICAL

**The system string already contains everything** (code context, PIPs, project data). Never duplicate it.

```javascript
// CORRECT — minimum payload
const payload = {
  messages,
  context: { activeProject: context?.activeProject || null },
  system,
};

// WRONG — sends code context 3x, causes 500
const payload = {
  messages,
  context: { ...context, codeContext },   // ← duplicates data already in system
  codeContext,                              // ← again
  system,                                  // ← already has everything
};
```

Also slim code context before baking it into the system string:
```javascript
const slim = {
  repo: codeContext.repoFullName,
  branch: codeContext.branch,
  files: (codeContext.fileTree || []).map(f => f.path).slice(0, 80),
  keyFiles: (codeContext.keyFiles || []).map(f => ({ path: f.path, content: f.content?.slice(0, 1500) })),
  summary: codeContext.summary,
};
```

---

## Aria Architecture (aria-assistant repo)

Aria runs on **Railway**, not Vercel. The `api/` folder in the repo is Vercel serverless functions — **it is not used in production**. Always edit `server/index.js` for non-sports backend changes.

| File | Purpose |
|---|---|
| `server/index.js` | Express server — auth, chat, calendar, SMS, weather, memory routes |
| `server/sports.js` | **All sports routes** — edit this for anything sports-related |
| `sportsBackend.js` | Old standalone module — **not imported anywhere**, ignore it |
| `client/src/App.jsx` | Frontend — intent detection, context fetching, Claude chat |
| `api/` | Vercel serverless stubs — **ignored in production** |
| `railway.toml` | Deploy config: `cd server && node index.js` |

**Why sports.js is separate:** `server/index.js` hit 942 lines when NHL + NBA routes were added. dax-execute has to rewrite the full file — at that size it truncates. `server/sports.js` is ~300 lines and safe for dax-execute to edit.

**Adding a new sport (NFL, MLB, etc.):**
1. Add a team lookup map in `server/sports.js` (same pattern as `NHL_TEAMS` / `NBA_TEAMS`)
2. Add 5 routes in `server/sports.js`: `/{sport}/next-game`, `/{sport}/score`, `/{sport}/standings`, `/{sport}/last-games`, `/{sport}/team-record`
3. Add intent keywords in `client/src/App.jsx` `detectIntent()` function
4. Add context-fetching blocks in `buildContext()` in App.jsx calling `formatContextBlock()` + `blocks.push()`
5. **NFL/NBA/MLB use ESPN API** — `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/...`
6. **NHL uses** `api-web.nhle.com/v1` — different response shape, see NHL section below
7. Write team lookup tables directly (git clone → edit → push) — never ask Dax to generate 30+ entries

---

## Aria Sports API — Known Issues & Patterns

### NHL API — Use the new endpoint

The old NHL API (`statsapi.web.nhl.com/api/v1/schedule`) is **deprecated and returns 404**. Do not use it anywhere.

**Correct endpoints (`api-web.nhle.com/v1`):**

| Data | Endpoint |
|---|---|
| Team schedule / live game | `/club-schedule-season/{abbr}/now` |
| Standings | `/standings/now` |
| Recent games | `/club-schedule-season/{abbr}/now` (filter `OFF`/`FINAL`) |
| Live score | `/club-schedule-season/{abbr}/now` (filter `LIVE`/`PRG`/`CRIT`) |

**NHL game states — critical for filtering:**

| State | Meaning |
|---|---|
| `FUT` | Future / not yet started |
| `LIVE` | Game in progress |
| `PRG` | Game in progress (alternate) |
| `CRIT` | Final minutes, high leverage |
| `FINAL` | Game over |
| `OFF` | Official / final (same as FINAL) |

```javascript
const liveStates = ['LIVE', 'PRG', 'CRIT'];
const finishedStates = ['OFF', 'FINAL'];

// Next scheduled game — skip live AND finished
const next = games.find(g => !liveStates.includes(g.gameState) && !finishedStates.includes(g.gameState));

// Current live game
const live = games.find(g => liveStates.includes(g.gameState));

// Recent completed games
const finished = games.filter(g => finishedStates.includes(g.gameState));
```

**Live score fields** (on game objects when `gameState` is live):
- `homeTeam.score`, `awayTeam.score` — current score
- `homeTeam.commonName.default`, `awayTeam.commonName.default` — team names
- `periodDescriptor.number` — current period number
- `periodDescriptor.periodType` — `'REG'`, `'OT'`, `'SO'`

### Aria sports routes (server/index.js) — current inventory

**NHL routes** (use `api-web.nhle.com/v1`):

| Route | Query param | Returns |
|---|---|---|
| `GET /api/sports/next-game` | `?team=dallas stars` | Next scheduled game (skips live) |
| `GET /api/sports/score` | `?team=dallas stars` | Live score if game in progress |
| `GET /api/sports/standings` | none | Full NHL standings |
| `GET /api/sports/last-games` | `?team=dallas stars` | Last 5 completed games |
| `GET /api/sports/team-record` | `?team=dallas stars` | W/L/OT/points/division rank |

**NBA routes** (use ESPN public API — `site.api.espn.com`):

| Route | Query param | Returns |
|---|---|---|
| `GET /api/sports/nba/next-game` | `?team=dallas mavericks` | Next scheduled game |
| `GET /api/sports/nba/score` | `?team=dallas mavericks` | Live score if game in progress |
| `GET /api/sports/nba/standings` | none | Full NBA standings |
| `GET /api/sports/nba/last-games` | `?team=dallas mavericks` | Last 5 completed games |
| `GET /api/sports/nba/team-record` | `?team=dallas mavericks` | W/L/win pct/conference |

**ESPN API endpoints used for NBA:**
- Schedule: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{abbr}/schedule`
- Live scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- Standings: `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings`

**ESPN game states:** `pre` = upcoming, `in` = live, `post` = finished (different from NHL's string states)

**ESPN response shape (competitions array):**
- `competitions[0].competitors` — array with `homeAway: 'home'|'away'`, `team.abbreviation`, `team.displayName`, `score`, `winner`
- `competitions[0].status.type.state` — `'pre'`/`'in'`/`'post'`
- `competitions[0].status.period` — current quarter/period number
- `competitions[0].status.displayClock` — clock string e.g. `"4:32"`
- `competitions[0].venue.fullName` — arena name

**Adding a new intent in App.jsx** — two places to touch:
1. Add to `intents` object in `detectIntent()` (regex for trigger words + team/sport keywords)
2. Add a context-fetching block in the `buildContext()` function that calls the matching route and calls `blocks.push(formatContextBlock(...))`

### All API calls go through the backend

Never call a league API (NHL, NBA, NFL, MLB) directly from the client (`App.jsx`, `voiceInput.js`). Always route through `server/index.js` backend routes. Client-side league API calls break CORS, expose credentials, and bypass caching.

- `voiceInput.js` → calls `/api/sports/next-game?team=` on our backend
- `App.jsx` context builder → calls `/api/sports/*` on our backend
- `server/index.js` → calls the league's official API

### sportsBackend.js is not imported

`sportsBackend.js` exists in the repo root but is **not imported by `server/index.js`**. It is a standalone unused module. Never add new sports routes there — always add to `server/index.js`.

### Team data goes stale — verify abbreviations

Teams relocate and rebrand. The team lookup tables in `server/index.js` and `voiceInput.js` need to reflect current reality:

| Was | Now |
|---|---|
| Arizona Coyotes (`ARI`) | Utah Mammoth (`UTA`, id: 53) |

When adding or editing team lookups, verify abbreviations against the current league roster. For NHL, cross-check against `api-web.nhle.com/v1/standings/now` — it returns the live team list with correct abbreviations.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| 500 error in ~300ms | `max_tokens` too high | Keep at 16000 |
| Code truncated | Claude wrote too much | Add "under 200 lines" constraint to prompt |
| JSON bleeding into chat | Review plan JSON saved to history | Filter with `looksLikeJson()` before saving |
| `github_repo` column error | `projectToRow()` sending unknown column | `githubRepo` lives in the `convo.__meta` JSON blob, not a DB column |
| Every message enters review mode | `pendingReview` being passed to `dax-chat` | Strip orchestration fields from context before calling edge function |
| Multiple approval cards | Old loop called `daxShowExecuteApproval` per EXECUTE block | Collect all blocks, call once with array |
| "non-2xx" error with no details | Supabase swallows error body | Use `error.context?.json?.()` to get actual message |
| New file commit fails | Sending `sha` for a file that doesn't exist | Only include `sha` in commit body when updating existing files |
| dax-chat 500 (large payload) | Code context sent 3x: inside `context`, as `codeContext`, AND baked into `system` | Send only `{ messages, context: { activeProject }, system }` — never include `codeContext` or `portfolio` separately |
| Code truncated (large data) | Asking Dax/Claude to write a file with 30+ static data entries | Write large static data files directly (git clone → edit → push) instead of generating via dax-execute |
| 403 HTML dumped in chat | GitHub API returns Cloudflare HTML instead of JSON; `res.json()` throws raw HTML into error message | Use `res.text()` then `JSON.parse()` with try/catch in fetchFile — return null on parse failure |
| Raw HTML/JSON error in chat | Error message from failed execute contains full HTTP response body | Truncate and strip HTML tags from error messages before displaying: `rawErr.slice(0,120).replace(/<[^>]+>/g,'')` |
| max_tokens reset to 64000 | dax-execute file reverted or overwritten without convention check | Always verify max_tokens is 16000 after any dax-execute edit — 64000 causes immediate 500 |
| Aria sport route 404 | Edited `api/sports/*.js` (Vercel stubs) instead of `server/index.js` | Aria backend is Railway Express — only `server/index.js` runs in production; `api/` is dead |
| NHL schedule returns 404 | Using deprecated `statsapi.web.nhl.com/api/v1/schedule` | Use `api-web.nhle.com/v1/club-schedule-season/{abbr}/now` — old API is gone |
| "Next game" returns live game | Filter only excludes `OFF`/`FINAL`, not `LIVE`/`PRG`/`CRIT` | Exclude all three live states when finding next scheduled game |
| Score route returns nothing during game | Filtering on wrong game states | Live games use `LIVE`, `PRG`, or `CRIT` — check all three |
| voiceInput not fetching data | Voice code calls league API directly instead of Aria backend | All sport API calls must go through `server/index.js` routes — never call NHL/NBA/etc. from client |
| Wrong team abbr / no data | Team relocated or rebranded (e.g. Arizona Coyotes → Utah Mammoth) | Verify team abbrs against `api-web.nhle.com/v1/standings/now` before hardcoding lookup tables |
| THINK block text leaks into chat | Literal `\n` or `\t` inside JSON string causes `JSON.parse()` to fail silently; block not stripped | Sanitize before parsing: `jsonStr.replace(/[\r\n\t]/g, ' ')` then parse |
