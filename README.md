# AutoLog

AI-powered changelog generator that turns GitHub commits into user-friendly changelogs.

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OPENROUTER_API_KEY=
```

---

## Technical Decisions

### Stack
- **Next.js (App Router)** — Single codebase for frontend + API, easy Vercel deployment
- **Better Auth** — TypeScript-first auth library with GitHub OAuth. Simpler than NextAuth, gives us the GitHub access token needed for repo access. (thanks Soohoon :D)
- **Supabase (Postgres)** — Persists users, repos, and changelog entries
- **OpenRouter** — LLM gateway that allows model switching without code changes

### Product Decisions
- **Full GitHub OAuth** — Evaluators should experience it as a real product. OAuth also provides the token we need to access repos without asking users to generate a PAT.
- **Multi-tenant** — Any user can sign in and connect their repos
- **Streaming LLM responses** — Vercel hobby tier has a 10s function timeout. LLM calls can exceed that. Streaming keeps the connection alive and provides better UX.
- **Public page structure** — Dates only (no version numbers). `/{owner}/{repo}/changelog` for public pages, `/dashboard` for the dev-facing tool.
- **Edit flow** — Textarea with markdown preview. Developer can edit AI output and preview what it would look like on their existing changelog before publishing.
- **Styling** — Tailwind + shadcn/ui. Clean, minimal aesthetic.

### Architecture

- **GitHub Token Flow** — On OAuth login, Better Auth stores the GitHub access token in the `account` table. API routes retrieve this token per-request to make authenticated GitHub API calls (fetching repos, commits, diffs).
- **API Authentication** — All protected routes verify the session via Better Auth before processing. Unauthenticated requests return 401.
- **Streaming Responses** — OpenRouter returns Server-Sent Events (SSE). The `/api/generate` route transforms this into a plain text stream for the client, keeping the connection alive past Vercel's timeout.

---

## Changelog Generation Flow

1. **Fetch commits** — Pull commits with diffs from GitHub API based on user's selected range
2. **Filter noise** — Remove node_modules, lock files, build artifacts, etc.
3. **Generate clarifying questions** — LLM analyzes a compact summary (messages + file paths, no diffs) and generates 2-4 targeted questions
4. **User answers questions** — Or skips individual questions / all of them
5. **Build detailed commit data** — Include file paths with +/- line counts. Conditionally include truncated diffs only for vague commits (messages < 5 words or containing "fix", "update", "wip", etc.)
6. **Generate changelog:**
   - ≤12 commits → single LLM call
   - \>12 commits → chunk into batches of 12, generate partial changelogs, merge into final output

---

## Changelog Generation: Design Decisions

### Handling Large Repositories

**Problem:** Users connecting repos with many commits would exceed LLM context limits.

**Solution:** Layered approach:
1. **Range selector** — Users choose "Since last entry", "Last 7/30 days", "Last 25/50 commits", or even choose a custom date range
2. **Chunking** — Process in batches of 12 commits, merge partial changelogs (no hard cap on total commits)
3. **Diff truncation** — Each file's patch capped at 500 characters

**Why both time and commit options?** Time-based works for active repos ("what changed this week"), but fails for dormant repos. Commit-based works universally.

### Handling Bad Commit Messages

**Problem:** Many repos have vague commits ("fix", "update", "wip"). The LLM can't generate useful changelogs from these alone.

**Solution:**
- Always include file paths with +/- line counts (shows scope even without good messages)
- Only include code diffs for vague commits; well-described commits don't need the extra context
- Truncated diffs (500 chars) still capture the "shape" of changes
- Prompt instructs LLM to infer features from file paths and diffs

**Rejected:** Including diffs for all commits (wastes tokens), or never including diffs (not enough context for bad commit messages).

### Changelog Grouping Strategy

**Rejected:** Group by type (Features, Improvements, Bug Fixes)
- Requires understanding commit *intent* — impossible with vague messages

**Chosen:** Group by product feature (e.g., "Calendar improvements", "Search functionality")
- Can be inferred from file paths even with bad commit messages
- More useful for end-users reading the changelog and how it actually affects them and their usage of the product

### File Filtering

**Excluded from context:** node_modules, lock files, markdown files, build artifacts, .env files

**Why:** These add tokens without useful changelog information.

### Commit Chunking

For large commit ranges, process in batches of 12 and merge partial changelogs into a final result.

**Rejected:** Processing all commits in a single LLM call (hits rate limits and context limits).

### Two-Phase Generation Flow

Before generating, the AI asks 2-4 targeted questions about user preferences (detail level, which areas to highlight, audience). Users can skip individual questions or all of them. Answers become context for better output.
<br />

This allows the user to have the changelog to be more tailored to what it focuses on

**Rejected:** One-click generation with no user input. One-size fits all doesn't tailor to the style or the info the user wants

### "Since Last Entry" Time Range

Users can generate changelogs for commits since their last published entry, supporting an incremental workflow.

**Rejected:** Only offering fixed time ranges (7/30 days) or commit counts.


### Preview with Context

Preview modal shows the draft changelog alongside existing published entries in a timeline view. Users see continuity and can check for overlap with previous entries.

**Rejected:** Preview showing only the draft in isolation.

---

## AI Tools Used

- **Claude Code** — Development assistance

---

## Data Model

### Tables

**Better Auth (managed by library):**
- `user` — User profile (id, name, email, image)
- `account` — OAuth accounts, stores GitHub `accessToken` for API access
- `session` — Active sessions
- `verification` — Email verification tokens

**Application:**
- `repos` — Connected repositories per user
  - `last_changelog_commit_sha` — Tracks the most recent commit included in a published changelog (enables "Since last entry" feature)
  - Unique constraint on `(user_id, owner, name)`
- `changelog_entries` — Published changelog entries
  - `published` flag — Enables draft vs published state
  - Indexed on `(repo_id, date DESC)` for efficient timeline queries

### Schema

```sql
-- Better Auth tables (user, account, session, verification) omitted for brevity

CREATE TABLE repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    last_changelog_commit_sha TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, owner, name)
);

CREATE TABLE changelog_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    content TEXT NOT NULL,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_repos_user ON repos(user_id);
CREATE INDEX idx_changelog_entries_repo_date ON changelog_entries(repo_id, date DESC);
```
