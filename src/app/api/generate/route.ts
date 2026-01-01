import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { fetchCommitsWithDiffs } from "@/lib/github";
import { generateChangelog } from "@/lib/openrouter";

export async function POST(request: Request) {
  const { owner, repo, since } = await request.json();

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
    console.log("Fetching commits for", owner, repo);
    const commits = await fetchCommitsWithDiffs(account.accessToken, owner, repo, since);
    console.log("Fetched", commits.length, "commits");

    if (commits.length === 0) {
      return Response.json({ error: "No commits found" }, { status: 400 });
    }

    // Generate changelog with streaming
    console.log("Calling OpenRouter...");
    const stream = await generateChangelog(commits);
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
