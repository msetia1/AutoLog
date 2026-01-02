import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { fetchCommitsWithDiffs } from "@/lib/github";
import { generateClarifyingQuestions } from "@/lib/openrouter";

const MAX_COMMITS = 50;

export async function POST(request: Request) {
  const { owner, repo, since, limit, additionalContext } = await request.json();

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

  try {
    // Fetch commits with diffs
    let commits = await fetchCommitsWithDiffs(account.accessToken, owner, repo, since);

    if (commits.length === 0) {
      return Response.json({ error: "No commits found in this range" }, { status: 400 });
    }

    // Apply limit
    const effectiveLimit = Math.min(limit || MAX_COMMITS, MAX_COMMITS);
    if (commits.length > effectiveLimit) {
      commits = commits.slice(0, effectiveLimit);
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
