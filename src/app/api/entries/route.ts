import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();

  // Get user's repos first
  const { data: repos, error: reposError } = await supabase
    .from("repos")
    .select("id, owner, name")
    .eq("user_id", session.user.id);

  if (reposError || !repos || repos.length === 0) {
    return Response.json([]);
  }

  const repoIds = repos.map((r) => r.id);

  // Get recent changelog entries
  const { data: entries, error: entriesError } = await supabase
    .from("changelog_entries")
    .select("id, repo_id, date, content, published, created_at")
    .in("repo_id", repoIds)
    .order("created_at", { ascending: false })
    .limit(5);

  if (entriesError) {
    console.error("Failed to fetch entries:", entriesError);
    return Response.json({ error: "Failed to fetch entries" }, { status: 500 });
  }

  // Attach repo info to entries
  const entriesWithRepo = entries?.map((entry) => {
    const repo = repos.find((r) => r.id === entry.repo_id);
    return {
      ...entry,
      repo: repo ? `${repo.owner}/${repo.name}` : null,
      owner: repo?.owner,
      repoName: repo?.name,
    };
  }) || [];

  return Response.json(entriesWithRepo);
}
