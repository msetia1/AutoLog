# Autolog Build Plan

## Build Order

### 1. Project Setup ✅
- [x] Initialize Next.js with App Router
- [x] Install and configure Tailwind CSS
- [x] Install and configure shadcn/ui
- [x] Add neo-button styles
- [x] Set up environment variables structure

### 2. Supabase + Schema ✅
- [x] Create Supabase project
- [x] Set up database tables (user, session, account, verification via Better Auth + repos, changelog_entries)
- [x] Configure Supabase client in Next.js (`src/lib/supabase/server.ts`)

### 3. Better Auth + GitHub OAuth ✅
- [x] Install Better Auth
- [x] Create GitHub OAuth app
- [x] Configure auth with GitHub provider (`src/lib/auth.ts`)
- [x] Set up auth API routes (`src/app/api/auth/[...all]/route.ts`)
- [x] Create sign in/out UI (home page)

### 4. GitHub Integration ✅
- [x] Fetch user's repos from GitHub API (`fetchUserRepos`)
- [x] Fetch commits for a repo with diffs (`fetchCommitsWithDiffs`)
- [ ] Store connected repo in database

### 5. OpenRouter + Streaming ⬅️ CURRENT
- [ ] Set up OpenRouter client
- [ ] Create prompt for changelog summarization
- [ ] Implement streaming API route
- [ ] Test with different models (Gemini Flash, GPT-4o-mini)

### 6. Dashboard UI
- [ ] Repo selection dropdown
- [ ] Generate changelog button
- [ ] Streaming text display
- [ ] Textarea editor with markdown preview
- [ ] Publish button

### 7. Public Changelog Page
- [ ] `/{owner}/{repo}/changelog` - list all entries
- [ ] `/{owner}/{repo}/changelog/{date}` - single entry
- [ ] Clean, minimal design

### 8. Polish
- [ ] Error states and handling
- [ ] Loading states
- [ ] Empty states
- [ ] Mobile responsive
- [ ] Test with large repos / many commits

### 9. Deploy
- [ ] Deploy to Vercel
- [ ] Configure production env vars
- [ ] Test production OAuth flow

### 10. Finalize
- [ ] Write README with all decisions
- [ ] Record 30-second screen recording
- [ ] Final review
