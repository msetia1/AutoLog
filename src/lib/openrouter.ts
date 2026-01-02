import type { Commit } from "./github";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const CHUNK_SIZE = 12; // Commits per chunk
const MAX_PATCH_LENGTH = 500;

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: {
    label: string;
    text: string;
    description?: string;
  }[];
}

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

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Compact summary for questions (no patches)
function buildCompactSummary(commits: Commit[]): string {
  const filteredCommits = commits.map(filterCommitFiles);

  const pathCounts: Record<string, number> = {};
  filteredCommits.forEach((commit) => {
    const files = commit.files || [];
    files.forEach((f) => {
      const parts = f.filename.split("/");
      const category = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
      pathCounts[category] = (pathCounts[category] || 0) + 1;
    });
  });

  const topAreas = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => `  - ${path}: ${count} changes`)
    .join("\n");

  const commitList = filteredCommits.map((commit) => {
    const files = commit.files || [];
    const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return `- ${commit.commit.message.split("\n")[0]} (${files.length} files, ${totalChanges} lines)`;
  }).join("\n");

  return `Most active areas:\n${topAreas}\n\nCommits (${commits.length} total):\n${commitList}`;
}

// Detailed commit data for changelog generation
function buildDetailedCommitData(commits: Commit[]): string {
  const filteredCommits = commits.map(filterCommitFiles);

  return filteredCommits.map((commit) => {
    const files = commit.files || [];
    const fileChanges = files
      .map((f) => `  - ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join("\n");

    // Only include patches for vague commit messages
    const messageWords = commit.commit.message.toLowerCase().split(/\s+/);
    const vagueIndicators = ["fix", "update", "change", "tweak", "misc", "wip", "stuff"];
    const isVague = messageWords.length < 5 || vagueIndicators.some(v => messageWords.includes(v));

    let patches = "";
    if (isVague) {
      patches = files
        .filter((f) => f.patch)
        .slice(0, 3)
        .map((f) => {
          const patch = f.patch!.length > MAX_PATCH_LENGTH
            ? f.patch!.slice(0, MAX_PATCH_LENGTH) + "\n..."
            : f.patch;
          return `  ${f.filename}:\n\`\`\`diff\n${patch}\n\`\`\``;
        })
        .join("\n");
    }

    return `## ${commit.commit.message.split("\n")[0]}
Files: ${files.length} | +${files.reduce((s, f) => s + f.additions, 0)}/-${files.reduce((s, f) => s + f.deletions, 0)}
${fileChanges}${patches ? `\nDiffs:\n${patches}` : ""}`;
  }).join("\n\n---\n\n");
}

// Non-streaming call (for questions only)
async function callOpenRouter(
  prompt: string,
  options: { model?: string; jsonMode?: boolean; timeout?: number } = {}
): Promise<string> {
  const { model = "google/gemini-2.0-flash-lite-001", jsonMode = false, timeout = 60000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        ...(jsonMode && { response_format: { type: "json_object" } }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

// Streaming call - returns raw SSE stream
async function callOpenRouterStreaming(
  prompt: string,
  model: string = "google/gemini-2.0-flash-lite-001"
): Promise<ReadableStream<Uint8Array>> {
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
    throw new Error(`OpenRouter error: ${response.status} - ${errorBody}`);
  }

  return response.body!;
}

// Collect streaming response into a string, with optional progress forwarding
async function collectStreamContent(
  stream: ReadableStream<Uint8Array>,
  controller?: ReadableStreamDefaultController<Uint8Array>,
  encoder?: TextEncoder
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd === -1) break;

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            content += chunk;
            chunkCount++;
            // Send keep-alive marker every 20 chunks
            if (controller && encoder && chunkCount % 20 === 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "<!-- progress -->" } }] })}\n\n`));
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  return content;
}

// Generate clarifying questions
export async function generateClarifyingQuestions(
  commits: Commit[],
  additionalContext?: string,
  model: string = "google/gemini-2.0-flash-lite-001"
): Promise<ClarifyingQuestion[]> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const summary = buildCompactSummary(commits);

  const prompt = `Analyze these git commits and generate 2-4 clarifying questions to help write a better changelog for END USERS.

IMPORTANT: This changelog is for USERS, not developers. Completely IGNORE these when deciding what to ask about:
- Database migrations, schema changes
- Logging, debugging, error handling internals
- Config files, environment variables
- Refactoring, code cleanup, tests
- API endpoints, webhooks, rate limiting
- Any infrastructure/developer-only changes

Focus ONLY on user-facing features. Good questions help determine:
- Which user-facing features to prioritize or highlight
- How to describe the BENEFITS to users (not just what changed, but why it matters)
- Whether to detail each feature or summarize groups
- What the target audience cares about (e.g., power users vs casual users)

Rules:
- ONLY ask about things that affect what users can SEE or DO
- Ask questions SPECIFIC to actual user-facing features (reference specific features you see)
- Include questions about HOW to frame benefits (e.g., "focus on time saved" vs "focus on new capabilities")
- Each question should have 3-4 concrete options PLUS always include a final option: "Do not include this information"
- If you see many commits in one feature area, ask whether to detail or summarize
- Do NOT use markdown formatting (no *asterisks*, **bold**, etc.) — use plain text only

${summary}

${additionalContext ? `User context: ${additionalContext}\n` : ""}
Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "unique_id",
      "question": "Your specific question?",
      "options": [
        {"label": "A", "text": "Option", "description": "What this means"},
        {"label": "B", "text": "Option", "description": "What this means"},
        {"label": "C", "text": "Option", "description": "What this means"}
      ]
    }
  ]
}`;

  console.log("Generating questions, prompt length:", prompt.length);

  try {
    const content = await callOpenRouter(prompt, { model, jsonMode: true, timeout: 30000 });
    if (!content) return [];
    const parsed = JSON.parse(content);
    return parsed.questions || [];
  } catch (err) {
    console.error("Failed to generate questions:", err);
    return [];
  }
}

// Build prompt for a chunk
function buildChunkPrompt(
  commits: Commit[],
  chunkIndex: number,
  totalChunks: number,
  additionalContext?: string,
  clarifyingAnswers?: Record<string, string>
): string {
  const commitData = buildDetailedCommitData(commits);

  let prefs = "";
  if (clarifyingAnswers && Object.keys(clarifyingAnswers).length > 0) {
    prefs = "\nUser preferences:\n" + Object.values(clarifyingAnswers)
      .map(a => `- ${a}`)
      .join("\n") + "\n";
  }

  const context = additionalContext ? `\nContext: ${additionalContext}\n` : "";

  return `You are writing a changelog for END USERS (not developers). ${totalChunks > 1 ? `This is batch ${chunkIndex + 1} of ${totalChunks}.` : ""}

CRITICAL RULES:
1. Write for someone who USES the product, not someone who builds it
2. Translate technical changes into USER BENEFITS - explain WHY each change matters to users
3. Be SPECIFIC and DETAILED - don't just say "improved X", explain what's better and how it helps
4. SKIP entirely: logging, debugging, error handling, performance internals, refactoring, code cleanup, developer tools
5. NEVER mention: file names, component names, endpoints, APIs, props, Redis, Celery, webhooks, rate limiting, databases, database migrations, schema changes, configs

TRANSLATION EXAMPLES:
- BAD: "Added LANGCHAIN_TRACING_V2 for debugging" → SKIP (internal only)
- BAD: "Added hideButtons prop to MinimizedSessionCard" → SKIP (internal only)
- BAD: "Enhanced Redis client management" → SKIP (internal only)
- BAD: "Implemented rate limiting for Garmin API" → SKIP (internal only, unless it fixes a user-visible problem)
- TOO VAGUE: "Improved reliability of Garmin sync" → BETTER: "Garmin sync now handles connection drops gracefully - your workouts won't be lost if your connection is interrupted"
- TOO VAGUE: "Web search results now appear faster" → BETTER: "Web search results now appear in under 2 seconds, down from 10+ seconds"
- TOO VAGUE: "You can now view your saved memories" → BETTER: "New Memories page lets you browse, search, and delete saved memories. Access it from the sidebar."
- BAD: "Improved error handling" → Only include if it means something to users, like "Clearer error messages now tell you exactly what went wrong and how to fix it"

FORMAT:
- Use ## headers for feature groups (group by what users care about)
- Use bullet points for individual changes
- Be specific about what users can now DO, not how it was implemented
- Output ONLY the changelog content - NO introduction, NO preamble, NO "Here's..." or "Based on..."
- Start DIRECTLY with the first ## header
${context}${prefs}
Commits:
${commitData}

Changelog:`;
}

// Build merge prompt
function buildMergePrompt(
  partials: string[],
  totalCommits: number,
  additionalContext?: string,
  clarifyingAnswers?: Record<string, string>
): string {
  let prefs = "";
  if (clarifyingAnswers && Object.keys(clarifyingAnswers).length > 0) {
    prefs = "\nUser preferences:\n" + Object.values(clarifyingAnswers)
      .map(a => `- ${a}`)
      .join("\n") + "\n";
  }

  const context = additionalContext ? `\nContext: ${additionalContext}\n` : "";

  return `Merge these ${partials.length} partial changelogs (${totalCommits} commits) into one coherent changelog for END USERS.

Your job:
1. COMBINE related items under unified headers
2. REMOVE duplicates
3. REMOVE any developer-focused items that slipped through (logging, debugging, error handling internals, API endpoints, config changes, refactoring)
4. KEEP only changes that affect what users can SEE or DO
5. Make each item SPECIFIC and DETAILED - explain the benefit to users, not just what changed
6. Avoid vague phrases like "improved X" or "better Y" - be concrete about what's better and why it matters
7. Organize with most impactful user-facing changes first
8. Use ## headers and bullet points
9. Output ONLY the changelog content - NO introduction, NO preamble, NO "Here's..." or "Based on..."
10. Start DIRECTLY with the first ## header
${context}${prefs}
Partials:

${partials.map((p, i) => `=== PART ${i + 1} ===\n${p}`).join("\n\n")}

Final changelog:`;
}

// Main changelog generation - streams SSE format
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
  const chunks = chunkArray(commits, CHUNK_SIZE);

  console.log(`Processing ${commits.length} commits in ${chunks.length} chunks`);

  // Single chunk - stream directly
  if (chunks.length === 1) {
    const prompt = buildChunkPrompt(chunks[0], 0, 1, options?.additionalContext, options?.clarifyingAnswers);
    console.log("Single chunk, prompt length:", prompt.length);
    return callOpenRouterStreaming(prompt, model);
  }

  // Multiple chunks - process and merge with continuous streaming
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const partials: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          // Progress update
          const msg = `data: ${JSON.stringify({ choices: [{ delta: { content: `*Processing batch ${i + 1}/${chunks.length}...*\n` } }] })}\n\n`;
          controller.enqueue(encoder.encode(msg));

          const prompt = buildChunkPrompt(chunks[i], i, chunks.length, options?.additionalContext, options?.clarifyingAnswers);
          console.log(`Chunk ${i + 1}/${chunks.length}, prompt: ${prompt.length} chars`);

          // Stream this chunk's generation (forwards dots to keep connection alive)
          const stream = await callOpenRouterStreaming(prompt, model);
          const content = await collectStreamContent(stream, controller, encoder);
          partials.push(content);

          // Progress dot
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: " Done.\n" } }] })}\n\n`));
        }

        // Merge step
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "\n*Merging results...*\n\n---\n\n" } }] })}\n\n`));

        const mergePrompt = buildMergePrompt(partials, commits.length, options?.additionalContext, options?.clarifyingAnswers);
        console.log("Merge prompt:", mergePrompt.length, "chars");

        // Stream merge directly to client
        const mergeStream = await callOpenRouterStreaming(mergePrompt, model);
        const reader = mergeStream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        controller.close();
      } catch (error) {
        console.error("Generation error:", error);
        const errMsg = `data: ${JSON.stringify({ choices: [{ delta: { content: `\n\nError: ${error instanceof Error ? error.message : "Unknown"}` } }] })}\n\n`;
        controller.enqueue(encoder.encode(errMsg));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}
