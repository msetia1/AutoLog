import type { Commit } from "./github";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PATCH_LENGTH = 500; // Truncate diffs to keep prompt size manageable

// Files/directories to exclude from changelog context
const EXCLUDED_PATTERNS = [
  /node_modules\//,
  /\.venv\//,
  /venv\//,
  /vendor\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.git\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.md$/,
  /\.lock$/,
];

function shouldIncludeFile(filename: string): boolean {
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(filename));
}

function filterCommitFiles(commit: Commit): Commit {
  if (!commit.files) return commit;

  return {
    ...commit,
    files: commit.files.filter((file) => shouldIncludeFile(file.filename)),
  };
}

function buildPrompt(commits: Commit[]): string {
  const filteredCommits = commits.map(filterCommitFiles);

  const commitSummaries = filteredCommits.map((commit) => {
    const files = commit.files || [];
    const fileChanges = files
      .map((f) => `  - ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join("\n");

    const patches = files
      .filter((f) => f.patch)
      .map((f) => {
        const truncated = f.patch!.length > MAX_PATCH_LENGTH;
        const patch = truncated
          ? f.patch!.slice(0, MAX_PATCH_LENGTH) + "\n... (truncated)"
          : f.patch;
        return `### ${f.filename}\n\`\`\`diff\n${patch}\n\`\`\``;
      })
      .join("\n\n");

    return `## Commit: ${commit.commit.message.split("\n")[0]}
SHA: ${commit.sha.slice(0, 7)}
Author: ${commit.commit.author.name}
Date: ${commit.commit.author.date}

Files changed:
${fileChanges || "  (no relevant files)"}

${patches ? `Diffs:\n${patches}` : ""}`;
  }).join("\n\n---\n\n");

  return `You are a changelog writer. Write a detailed, user-friendly changelog from the commits below.

Requirements:
1. Group by product feature (e.g., "Calendar improvements", "Search functionality"), NOT by type (features/bugs) or technical area (API/database)
2. Be SPECIFIC about what changed. Describe the actual change, not vague summaries.
   - BAD: "Added calendar features"
   - GOOD: "Added a revert button to undo AI-suggested changes"
   - BAD: "Improved performance"
   - GOOD: "Reduced load time for large documents"
3. Infer the product feature from file paths and diffs when commit messages are vague
4. Write for end-users, not developers. Skip purely internal changes.
5. DO NOT include information regarding implementation details.
   - BAD: Fixed issues with the Chat Panel, Chat Input, Message List, and Message Bubble, this was achieved by upgrading dependencies, and some slight restructuring
   - GOOD:  Fixed rendering issues with the Chat Panel, Chat Input, Message List, and Message Bubble
6. Use markdown with ## headers for each feature group and bullet points for changes

Commits:
${commitSummaries}

Changelog:`;
}

export async function generateChangelog(
  commits: Commit[],
  model: string = "google/gemini-2.0-flash-lite-001"
): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const prompt = buildPrompt(commits);
  console.log("OpenRouter prompt length:", prompt.length, "chars");

  const response = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenRouter error response:", response.status, errorBody);
    throw new Error(`OpenRouter error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  if (!response.body) {
    throw new Error("OpenRouter returned no response body");
  }

  return response.body;
}
