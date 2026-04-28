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

Aria runs on **Railway**, not Vercel. The `api/` folder in the repo is Vercel serverless functions — **it is not used in production**. Always edit `server/index.js` for backend changes.

| File | Purpose |
|---|---|
| `server/index.js` | Express server — all API routes live here |
| `sportsBackend.js` | NHL team data + NHL API helpers — **not imported by server/index.js**, standalone module |
| `client/src/App.jsx` | Frontend — intent detection, context fetching, Claude chat |
| `api/` | Vercel serverless stubs — **ignored in production** |
| `railway.toml` | Deploy config: `cd server && node index.js` |

**Adding a new sport (NBA, NFL, MLB):**
1. Add a team lookup map in `server/index.js` (same pattern as `NHL_NEXT_GAME_TEAMS`)
2. Add routes: `/api/sports/next-game`, `/api/sports/standings`, `/api/sports/last-games`, `/api/sports/team-record` — scoped to that sport (e.g. `?sport=nba&team=mavericks`)
3. Add intent keywords in `client/src/App.jsx` (extend `sports:` regex and add `nextGame`/`standings`/etc. regexes)
4. Add `detectTeam()` call in the context-building section and `fetchJson` calls to the new routes
5. **Use the league's official API** — NHL uses `api-web.nhle.com`, NBA uses `stats.nba.com` or ESPN, NFL uses ESPN, MLB uses `statsapi.mlb.com`
6. Write team lookup tables directly (git clone → edit → push) — do NOT ask Dax to generate 30+ team entries

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
