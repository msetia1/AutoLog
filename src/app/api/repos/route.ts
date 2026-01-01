import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { fetchUserRepos } from "@/lib/github";

export async function GET() {
  // Get current session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get GitHub access token from account table
  const supabase = await createServerClient();
  const { data: account, error } = await supabase
    .from("account")
    .select("accessToken")
    .eq("userId", session.user.id)
    .eq("providerId", "github")
    .single();

  if (error || !account?.accessToken) {
    return Response.json({ error: "GitHub account not found" }, { status: 400 });
  }

  // Fetch repos from GitHub
  try {
    const repos = await fetchUserRepos(account.accessToken);
    return Response.json(repos);
  } catch (err) {
    return Response.json({ error: "Failed to fetch repos" }, { status: 500 });
  }
}
