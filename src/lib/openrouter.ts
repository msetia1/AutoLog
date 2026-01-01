import type { Commit } from "./github";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

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
      .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
      .join("\n\n");

    return `## Commit: ${commit.commit.message.split("\n")[0]}
SHA: ${commit.sha.slice(0, 7)}
Author: ${commit.commit.author.name}
Date: ${commit.commit.author.date}

Files changed:
${fileChanges || "  (no relevant files)"}

${patches ? `Diffs:\n${patches}` : ""}`;
  }).join("\n\n---\n\n");

  return `You are a changelog writer for a software project. Based on the following commits and their diffs, write a user-friendly changelog entry.

Guidelines:
- Write for end-users, not developers
- Group changes into categories: Features, Improvements, Bug Fixes
- Use clear, concise bullet points
- Focus on what changed from the user's perspective, not technical implementation details
- Skip internal refactoring or code cleanup unless it affects users
- If there are no meaningful user-facing changes, say so

Commits:
${commitSummaries}

Write the changelog entry in markdown format:`;
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
