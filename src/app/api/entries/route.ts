import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const searchParams = request.nextUrl.searchParams;
  const filterOwner = searchParams.get("owner");
  const filterRepo = searchParams.get("repo");

  // Get user's repos first
  let reposQuery = supabase
    .from("repos")
    .select("id, owner, name")
    .eq("user_id", session.user.id);

  // Filter by specific repo if provided
  if (filterOwner && filterRepo) {
    reposQuery = reposQuery.eq("owner", filterOwner).eq("name", filterRepo);
  }

  const { data: repos, error: reposError } = await reposQuery;

  if (reposError || !repos || repos.length === 0) {
    return Response.json([]);
  }

  const repoIds = repos.map((r) => r.id);

  // Get changelog entries (published only when filtering by repo for preview)
  let entriesQuery = supabase
    .from("changelog_entries")
    .select("id, repo_id, date, content, published, created_at")
    .in("repo_id", repoIds)
    .order("created_at", { ascending: false });

  // When fetching for a specific repo preview, only get published entries
  if (filterOwner && filterRepo) {
    entriesQuery = entriesQuery.eq("published", true);
  } else {
    entriesQuery = entriesQuery.limit(5);
  }

  const { data: entries, error: entriesError } = await entriesQuery;

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
