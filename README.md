This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Decisions Log

### Stack
- **Framework:** Next.js (App Router) — one codebase for frontend + API, simple Vercel deployment
- **Auth:** Better Auth with GitHub OAuth — TypeScript-first, simpler than NextAuth, aligns with Greptile auth (thanks for posting about it Soohoon). Also gives us GitHub access token for repo access.
- **Database:** Supabase (Postgres) — need to persist users, connected repos, changelog entries. Free tier, works well with Vercel.
- **AI:** OpenRouter — allows easy model switching to find best summarization quality

### Product Decisions
- **Full GitHub OAuth flow** (not env vars or paste-URL): Greptile evaluators should experience it as a real product. OAuth also gives us the token we need to access their repos without asking them to generate a PAT.
- **Multi-tenant:** Any user can sign in and connect their repos
- **Streaming LLM responses:** Vercel hobby has 10s timeout. LLM calls can exceed that. Streaming keeps connection alive + better UX (text appears as it generates).
- **Simple date range:** "Since last changelog" only (or all commits if first time). No date picker for MVP — can add later if time permits.
- **AI input: full diffs** — Use large-context models (Gemini Flash, GPT-4o-mini) so we can send full commit diffs. Better input = better summaries. No "learn more" button for MVP — just well-written bullet points grouped by category (Features/Fixes/Improvements).
  - **NOTE:** Needs extensive testing to verify full diffs work well at scale (large repos, many commits).
- **Public page structure:** Dates only (no version numbers). `/changelog` shows all entries newest-first. `/changelog/{date}` shows individual entry.
- **URL structure:** Path-based multi-tenancy. `/{owner}/{repo}/changelog` for public pages. `/dashboard` for dev-facing tool. Keep them separate, no conditional UI.
- **Edit flow:** Textarea with live markdown preview. Dev can edit AI output before publishing.
- **Styling:** Tailwind + shadcn/ui. Clean, minimal aesthetic. Accessible components out of the box.

### Database Schema (Supabase/Postgres)
- **users:** id, github_id, email, name, avatar_url, access_token, created_at
- **repos:** id, user_id (FK), owner, name, last_changelog_commit_sha, created_at
- **changelog_entries:** id, repo_id (FK), date, content (markdown), published, created_at, updated_at

### Future Features (mention in README)
- Export to Markdown/HTML/JSON for teams who want to host on their own domain
- Custom date range selection
- AI-generated detailed explanations ("learn more")
