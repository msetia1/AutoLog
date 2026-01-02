import type { Commit } from "./github";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PATCH_LENGTH = 500; // Truncate diffs to keep prompt size manageable

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: {
    label: string;
    text: string;
    description?: string;
  }[];
}

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

function buildCommitSummary(commits: Commit[]): string {
  const filteredCommits = commits.map(filterCommitFiles);

  return filteredCommits.map((commit) => {
    const files = commit.files || [];
    const fileList = files.map((f) => f.filename).join(", ");

    return `- ${commit.commit.message.split("\n")[0]} (${files.length} files: ${fileList || "none"})`;
  }).join("\n");
}

function buildQuestionsPrompt(commits: Commit[], additionalContext?: string): string {
  const summary = buildCommitSummary(commits);

  return `Analyze these git commits and generate 2-3 clarifying questions that would help write a better changelog.

Questions should help determine:
- How to group or categorize related commits
- Level of technical detail to include
- What changes to emphasize or de-emphasize
- Audience or tone preferences

Rules:
- Only ask questions where commits genuinely have multiple reasonable interpretations
- If the commits are straightforward, return fewer questions (or even 0)
- Each question should have 3-4 options
- Questions should be specific to what you observe in these commits

Commits (${commits.length} total):
${summary}

${additionalContext ? `Additional context from user:\n${additionalContext}\n` : ""}
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "questions": [
    {
      "id": "unique_id",
      "question": "Your question here?",
      "options": [
        {"label": "A", "text": "Option text", "description": "Brief explanation"},
        {"label": "B", "text": "Option text", "description": "Brief explanation"},
        {"label": "C", "text": "Option text", "description": "Brief explanation"}
      ]
    }
  ]
}`;
}

function buildPrompt(commits: Commit[], additionalContext?: string, clarifyingAnswers?: Record<string, string>): string {
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

  // Build user preferences section from clarifying answers
  let preferencesSection = "";
  if (clarifyingAnswers && Object.keys(clarifyingAnswers).length > 0) {
    const prefs = Object.entries(clarifyingAnswers)
      .map(([questionId, answer]) => `- ${questionId}: ${answer}`)
      .join("\n");
    preferencesSection = `\nUser preferences (from clarifying questions):\n${prefs}\n`;
  }

  // Build additional context section
  const contextSection = additionalContext
    ? `\nAdditional context from user:\n${additionalContext}\n`
    : "";

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
7. NEVER mention specific file names. Always reference things based on the feature.
8. NEVER mention anything that only the software development team needs to know
${contextSection}${preferencesSection}
Commits:
${commitSummaries}

Changelog:`;
}

export async function generateClarifyingQuestions(
  commits: Commit[],
  additionalContext?: string,
  model: string = "google/gemini-2.0-flash-lite-001"
): Promise<ClarifyingQuestion[]> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const prompt = buildQuestionsPrompt(commits, additionalContext);
  console.log("Generating clarifying questions, prompt length:", prompt.length, "chars");

  console.log("Sending request to OpenRouter for questions...");

  // Add timeout for the request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log("Request timed out after 30s");
    controller.abort();
  }, 30000);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  console.log("Got response from OpenRouter:", response.status);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenRouter error response:", response.status, errorBody);
    throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log("Parsed response data");
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.log("No content in response, returning empty questions");
    return [];
  }

  console.log("Raw content from LLM:", content.slice(0, 200));

  try {
    // With structured output, content should be valid JSON
    const parsed = JSON.parse(content);
    console.log("Parsed questions:", parsed.questions?.length || 0);
    return parsed.questions || [];
  } catch (err) {
    console.error("Failed to parse questions JSON:", err);
    console.log("Full content:", content);
    return [];
  }
}

export async function generateChangelog(
  commits: Commit[],
  options?: {
    additionalContext?: string;
    clarifyingAnswers?: Record<string, string>;
    model?: string;
  }
): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const model = options?.model || "google/gemini-2.0-flash-lite-001";
  const prompt = buildPrompt(commits, options?.additionalContext, options?.clarifyingAnswers);
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
