import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { owner, repo, content } = await request.json();

  if (!owner || !repo || !content) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();

  // Get or create repo record
  let repoId: string;

  const { data: existingRepo } = await supabase
    .from("repos")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("owner", owner)
    .eq("name", repo)
    .single();

  if (existingRepo) {
    repoId = existingRepo.id;
  } else {
    const { data: newRepo, error: repoError } = await supabase
      .from("repos")
      .insert({
        user_id: session.user.id,
        owner,
        name: repo,
      })
      .select("id")
      .single();

    if (repoError || !newRepo) {
      console.error("Failed to create repo:", repoError);
      return Response.json({ error: "Failed to create repo record" }, { status: 500 });
    }
    repoId = newRepo.id;
  }

  // Create changelog entry
  const { data: entry, error: entryError } = await supabase
    .from("changelog_entries")
    .insert({
      repo_id: repoId,
      date: new Date().toISOString().split("T")[0],
      content,
      published: true,
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    console.error("Failed to save changelog:", entryError);
    return Response.json({ error: "Failed to save changelog" }, { status: 500 });
  }

  return Response.json({
    success: true,
    id: entry.id,
    url: `/${owner}/${repo}/changelog`,
  });
}
