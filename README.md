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
- **Next.js (App Router)** — Single codebase for frontend + API, simple Vercel deployment
- **Better Auth** — TypeScript-first auth library with GitHub OAuth. Simpler than NextAuth, gives us the GitHub access token needed for repo access.
- **Supabase (Postgres)** — Persists users, repos, and changelog entries
- **OpenRouter** — LLM gateway that allows model switching without code changes

### Product Decisions
- **Full GitHub OAuth** — Evaluators should experience it as a real product. OAuth also provides the token we need to access repos without asking users to generate a PAT.
- **Multi-tenant** — Any user can sign in and connect their repos
- **Streaming LLM responses** — Vercel hobby tier has a 10s function timeout. LLM calls can exceed that. Streaming keeps the connection alive and provides better UX.
- **Public page structure** — Dates only (no version numbers). `/{owner}/{repo}/changelog` for public pages, `/dashboard` for the dev-facing tool.
- **Edit flow** — Textarea with markdown preview. Developer can edit AI output before publishing.
- **Styling** — Tailwind + shadcn/ui. Clean, minimal aesthetic.

---

## Changelog Generation: Design Decisions

### Handling Large Repositories

**Problem:** Users connecting repos with many commits would exceed LLM context limits (hit 478K tokens on a 48-commit repo with full diffs).

**Solution:** Layered approach:
1. **Range selector** — Users choose "Last 7/30/90 days" or "Last 25/50 commits"
2. **Commit cap** — Hard limit of 50 commits regardless of selection
3. **Diff truncation** — Each file's patch capped at 500 characters

**Why both time and commit options?** Time-based works for active repos ("what changed this week"), but fails for dormant repos. Commit-based works universally.

### Handling Bad Commit Messages

**Problem:** Many repos have vague commits ("fix", "update", "wip"). The LLM can't generate useful changelogs from these alone.

**Solution:**
- Always include file paths with +/- line counts (shows scope even without good messages)
- Prompt instructs LLM to infer features from file paths and diffs
- Truncated diffs (500 chars) still capture the "shape" of changes

### Output Quality vs Input Size

**Observation:** 50 commits produced generic summaries ("Added calendar features"), while 25 commits produced specific details ("Added a revert button to undo AI-suggested changes").

**Why:** LLMs compress when given more input. Less input = more room for detail.

**Solution:** Prompt engineering with explicit BAD/GOOD examples to anchor expected specificity.

### Changelog Grouping Strategy

**Rejected:** Group by type (Features, Improvements, Bug Fixes)
- Requires understanding commit *intent* — impossible with vague messages

**Chosen:** Group by product feature (e.g., "Calendar improvements", "Search functionality")
- Can be inferred from file paths even with bad commit messages
- More useful for end-users reading the changelog

### File Filtering

**Excluded from context:** node_modules, lock files, markdown files, build artifacts, .env files

**Why:** These add tokens without useful changelog information.

---

## AI Tools Used

- **Claude Code** — Development assistance
- **OpenRouter (Gemini 2.0 Flash Lite)** — Changelog generation
