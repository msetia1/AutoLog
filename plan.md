# Autolog Build Plan

## Build Order

### 1. Project Setup
- [ ] Initialize Next.js with App Router
- [ ] Install and configure Tailwind CSS
- [ ] Install and configure shadcn/ui
- [ ] Set up environment variables structure

### 2. Supabase + Schema
- [ ] Create Supabase project
- [ ] Set up database tables (users, repos, changelog_entries)
- [ ] Configure Supabase client in Next.js

### 3. Better Auth + GitHub OAuth
- [ ] Install Better Auth
- [ ] Create GitHub OAuth app
- [ ] Configure auth with GitHub provider
- [ ] Set up auth API routes
- [ ] Create sign in/out UI

### 4. GitHub Integration
- [ ] Fetch user's repos from GitHub API
- [ ] Fetch commits for a repo (with pagination)
- [ ] Fetch diffs for commits
- [ ] Store connected repo in database

### 5. OpenRouter + Streaming
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
