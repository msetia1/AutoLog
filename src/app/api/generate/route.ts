import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { fetchCommitsWithDiffs } from "@/lib/github";
import { generateChangelog } from "@/lib/openrouter";

const MAX_COMMITS = 50; // Safety cap

export async function POST(request: Request) {
  const { owner, repo, since, sinceLast, limit, additionalContext, clarifyingAnswers } = await request.json();

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
    console.log("Using since last changelog:", effectiveSince);
  }

  try {
    // Fetch commits with diffs
    console.log("Fetching commits for", owner, repo, "since:", effectiveSince, "limit:", limit);
    let commits = await fetchCommitsWithDiffs(account.accessToken, owner, repo, effectiveSince);
    console.log("Fetched", commits.length, "commits from GitHub");

    if (commits.length === 0) {
      const errorMsg = sinceLast
        ? "No commits since last changelog"
        : "No commits found in this range";
      return Response.json({ error: errorMsg }, { status: 400 });
    }

    // Apply limit (user-selected or safety cap)
    const effectiveLimit = Math.min(limit || MAX_COMMITS, MAX_COMMITS);
    const totalCommits = commits.length;
    if (commits.length > effectiveLimit) {
      commits = commits.slice(0, effectiveLimit);
      console.log(`Capped to ${effectiveLimit} commits (from ${totalCommits})`);
    }

    // Generate changelog with streaming
    console.log("Calling OpenRouter with", commits.length, "commits...");
    const stream = await generateChangelog(commits, {
      additionalContext,
      clarifyingAnswers,
    });
    console.log("Got stream from OpenRouter");

    // Transform SSE stream to extract just the content
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            while (true) {
              const lineEnd = buffer.indexOf("\n");
              if (lineEnd === -1) break;

              const line = buffer.slice(0, lineEnd).trim();
              buffer = buffer.slice(lineEnd + 1);

              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(new TextEncoder().encode(content));
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("Generate changelog error:", err);
    return Response.json({
      error: "Failed to generate changelog",
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
