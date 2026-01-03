import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { fetchCommitsWithDiffs } from "@/lib/github";
import { generateClarifyingQuestions } from "@/lib/openrouter";

export async function POST(request: Request) {
  const { owner, repo, since, until, sinceLast, limit, additionalContext } = await request.json();

  if (!owner || !repo) {
    return Response.json({ error: "Missing owner or repo" }, { status: 400 });
  }

  // Get current session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get GitHub access token
  const supabase = await createServerClient();
  const { data: account, error } = await supabase
    .from("account")
    .select("accessToken")
    .eq("userId", session.user.id)
    .eq("providerId", "github")
    .single();

  if (error || !account?.accessToken) {
    console.error("GitHub account error:", error);
    return Response.json({ error: "GitHub account not found" }, { status: 400 });
  }

  // Determine the since date
  let effectiveSince = since;

  if (sinceLast) {
    // First find the repo
    const { data: repoData } = await supabase
      .from("repos")
      .select("id")
      .eq("owner", owner)
      .eq("name", repo)
      .eq("user_id", session.user.id)
      .single();

    if (!repoData) {
      return Response.json({ error: "No previous changelog for this project" }, { status: 400 });
    }

    // Look up the most recent changelog for this repo
    const { data: lastEntry } = await supabase
      .from("changelog_entries")
      .select("created_at")
      .eq("repo_id", repoData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastEntry) {
      return Response.json({ error: "No previous changelog for this project" }, { status: 400 });
    }

    effectiveSince = lastEntry.created_at;
  }

  try {
    // Fetch commits with diffs
    let commits = await fetchCommitsWithDiffs(account.accessToken, owner, repo, effectiveSince, until);

    if (commits.length === 0) {
      const errorMsg = sinceLast
        ? "No commits since last changelog"
        : "No commits found in this range";
      return Response.json({ error: errorMsg }, { status: 400 });
    }

    // Apply limit only if user selected a commit-based range
    if (limit && commits.length > limit) {
      commits = commits.slice(0, limit);
    }

    // Generate clarifying questions
    const questions = await generateClarifyingQuestions(commits, additionalContext);

    return Response.json({ questions });
  } catch (err) {
    console.error("Generate questions error:", err);
    return Response.json({
      error: "Failed to generate questions",
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
