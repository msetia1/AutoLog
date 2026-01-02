"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Dropdown } from "@/components/ui/dropdown-01";
import ReactMarkdown from "react-markdown";
import { ClarifyingQuestions } from "@/components/clarifying-questions";
import type { Repo, Commit } from "@/lib/github";
import type { ClarifyingQuestion } from "@/lib/openrouter";

type GenerationPhase = "idle" | "analyzing" | "questions" | "generating";

interface ChangelogEntry {
  id: string;
  repo: string;
  owner: string;
  repoName: string;
  date: string;
  content: string;
  published: boolean;
  created_at: string;
}

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [changelog, setChangelog] = useState<string>("");
  const [generateError, setGenerateError] = useState<string>("");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [rangeType, setRangeType] = useState<string>("commits-25");
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string>("");
  const changelogRef = useRef<HTMLDivElement>(null);

  // Smart generation state
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>({});

  // Recent changelogs
  const [recentEntries, setRecentEntries] = useState<ChangelogEntry[]>([]);

  // Range options
  const rangeOptions = [
    { value: "days-7", label: "Last 7 days" },
    { value: "days-30", label: "Last 30 days" },
    { value: "days-90", label: "Last 90 days" },
    { value: "commits-25", label: "25 commits" },
    { value: "commits-50", label: "50 commits" },
  ];

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [session, isPending, router]);

  // Fetch repos and recent entries on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [reposRes, entriesRes] = await Promise.all([
          fetch("/api/repos"),
          fetch("/api/entries"),
        ]);

        if (reposRes.ok) {
          const data = await reposRes.json();
          setRepos(data);
        }

        if (entriesRes.ok) {
          const data = await entriesRes.json();
          setRecentEntries(data);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoadingRepos(false);
      }
    }

    if (session) {
      loadData();
    }
  }, [session]);

  // Fetch commits when repo is selected
  async function handleRepoSelect(repoFullName: string) {
    setSelectedRepo(repoFullName);
    setCommits([]);
    setChangelog("");
    setPublishedUrl("");
    setLoadingCommits(true);

    const [owner, repo] = repoFullName.split("/");

    try {
      const res = await fetch(`/api/commits?owner=${owner}&repo=${repo}`);
      if (res.ok) {
        const data = await res.json();
        setCommits(data);
      }
    } catch (err) {
      console.error("Failed to fetch commits:", err);
    } finally {
      setLoadingCommits(false);
    }
  }

  // Build params for API calls
  function buildParams() {
    const [owner, repo] = selectedRepo.split("/");
    const [type, value] = rangeType.split("-");
    const params: { owner: string; repo: string; since?: string; limit?: number; additionalContext?: string } = {
      owner,
      repo,
      additionalContext: additionalContext || undefined,
    };

    if (type === "days") {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(value));
      params.since = date.toISOString();
    } else {
      params.limit = parseInt(value);
    }

    return params;
  }

  // Phase 1: Start generation - fetch clarifying questions
  async function handleGenerate() {
    if (!selectedRepo || commits.length === 0) return;

    setGenerationPhase("analyzing");
    setChangelog("");
    setGenerateError("");
    setPublishedUrl("");
    setQuestions([]);
    setClarifyingAnswers({});

    const params = buildParams();

    try {
      const res = await fetch("/api/generate/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error?.includes("No commits")) {
          setGenerateError("No commits found in this range. Try a wider date range or select by commit count.");
          setGenerationPhase("idle");
          return;
        }
        console.log("Questions fetch failed, falling back to direct generation");
        await generateFinalChangelog({});
        return;
      }

      const data = await res.json();

      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setGenerationPhase("questions");
      } else {
        await generateFinalChangelog({});
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
      await generateFinalChangelog({});
    }
  }

  // Phase 2: Handle questions completion
  async function handleQuestionsComplete(answers: Record<string, string>) {
    setClarifyingAnswers(answers);
    await generateFinalChangelog(answers);
  }

  // Phase 2 (skip): Skip all questions
  async function handleSkipQuestions() {
    await generateFinalChangelog({});
  }

  // Phase 3: Generate final changelog with streaming
  async function generateFinalChangelog(answers: Record<string, string>) {
    setGenerationPhase("generating");

    const params = {
      ...buildParams(),
      clarifyingAnswers: answers,
    };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error?.includes("No commits")) {
          setGenerateError("No commits found in this range. Try a wider date range or select by commit count.");
        } else {
          setGenerateError(errorData.error || "Failed to generate changelog");
        }
        setGenerationPhase("idle");
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setChangelog((prev) => prev + chunk);

        if (changelogRef.current) {
          changelogRef.current.scrollTop = changelogRef.current.scrollHeight;
        }
      }
      // Clean up any markdown code block wrappers
      setChangelog((prev) => stripMarkdownCodeBlock(prev));
    } catch (err) {
      console.error("Failed to generate changelog:", err);
      setGenerateError("Failed to generate changelog");
    } finally {
      setGenerationPhase("idle");
    }
  }

  // Publish changelog
  async function handlePublish() {
    if (!selectedRepo || !changelog) return;

    const [owner, repo] = selectedRepo.split("/");
    setPublishing(true);

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, content: changelog }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Publish error:", errorData);
        return;
      }

      const data = await res.json();
      setPublishedUrl(data.url);

      // Refresh entries
      const entriesRes = await fetch("/api/entries");
      if (entriesRes.ok) {
        const entries = await entriesRes.json();
        setRecentEntries(entries);
      }
    } catch (err) {
      console.error("Failed to publish changelog:", err);
    } finally {
      setPublishing(false);
    }
  }

  // Format relative time
  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Strip markdown code block wrappers that LLM sometimes adds
  function stripMarkdownCodeBlock(content: string): string {
    return content
      .replace(/^```(?:markdown|md)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
  }

  // Get preview text from markdown content
  function getPreviewText(content: string): string {
    const plain = content
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.length > 100 ? plain.slice(0, 100) + "..." : plain;
  }

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0a]">
      {/* Grid background */}
      <div
        className="absolute inset-0 [background-size:20px_20px] [background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]"
      />
      {/* Radial fade */}
      <div className="pointer-events-none absolute inset-0 bg-[#0a0a0a] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />

      <div className="relative z-10 max-w-[1100px] mx-auto px-6 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center py-6">
          <div className="text-xl text-[#4AF262] flex items-center" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace' }}>
            {"autolog".split("").map((char, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1, delay: index * 0.08 }}
              >
                {char}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: 3, delay: 0.7 }}
              className="ml-0.5 text-[#4AF262]"
            >
              _
            </motion.span>
          </div>
          <div className="flex items-center gap-4" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace' }}>
            <span className="text-sm text-neutral-500">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 text-sm bg-[#4AF262]/15 border border-[#4AF262]/50 text-[#4AF262] rounded-lg hover:bg-[#4AF262]/25 hover:border-[#4AF262]/70 transition-all"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-col gap-6 flex-1 justify-center py-12">
          {/* Top Row - Generate Card + Recent Changelogs */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-stretch">
            {/* Main Card */}
            <div className="bg-[#141414]/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8">
              {/* Title */}
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Generate Changelog</h1>
                <p className="text-neutral-500">Select a repository and let AI summarize your recent commits</p>
              </div>

              {/* Repository Select */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Repository
                </label>
                <Dropdown
                  options={repos.map((repo) => ({
                    id: repo.id,
                    label: repo.full_name,
                  }))}
                  value={selectedRepo}
                  onChange={handleRepoSelect}
                  placeholder={loadingRepos ? "Loading repos..." : "Choose a repository"}
                  disabled={loadingRepos}
                />
              </div>

              {/* Time Range */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Time Range
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {rangeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRangeType(option.value)}
                      disabled={generationPhase !== "idle"}
                      className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                        rangeType === option.value
                          ? "bg-[#4AF262]/15 border-[#4AF262]/50 text-[#4AF262] font-medium"
                          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Context */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Additional Context <span className="text-neutral-600 normal-case">(optional)</span>
                </label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Add context to guide the AI... e.g., 'Focus on user-facing features. Audience is non-technical.'"
                  className="w-full min-h-[80px] px-4 py-3 text-sm bg-[#0a0a0a] border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-700 resize-none transition-colors"
                  disabled={generationPhase !== "idle"}
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!selectedRepo || commits.length === 0 || generationPhase !== "idle"}
                className="w-full py-4 text-sm font-semibold bg-[#4AF262]/15 border border-[#4AF262]/50 text-[#4AF262] rounded-xl hover:bg-[#4AF262]/25 hover:border-[#4AF262]/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {generationPhase === "analyzing" ? "Analyzing..." :
                 generationPhase === "generating" ? "Generating..." :
                 generationPhase === "questions" ? "Answer Questions Below" :
                 loadingCommits ? "Loading commits..." :
                 "Generate Changelog"}
              </button>
            </div>

            {/* Sidebar - Recent Changelogs */}
            <aside className="flex">
              <div className="bg-[#141414]/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 flex-1">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">Recent Changelogs</h2>
                {recentEntries.length === 0 ? (
                  <p className="text-sm text-neutral-600">No changelogs yet</p>
                ) : (
                  <div className="space-y-3">
                    {recentEntries.map((entry) => (
                      <a
                        key={entry.id}
                        href={`/${entry.owner}/${entry.repoName}/changelog`}
                        className="block p-2 -mx-2 rounded-lg hover:bg-neutral-800/50 transition-colors group"
                      >
                        <div className="text-sm text-neutral-300 group-hover:text-white transition-colors line-clamp-2 mb-1">
                          {getPreviewText(entry.content)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-neutral-600">
                          <span className="font-mono">{formatRelativeTime(entry.created_at)}</span>
                          <span>·</span>
                          <span className="truncate">{entry.repo}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* Bottom Row - Full Width Results/Questions */}
          {/* Analyzing State */}
          {generationPhase === "analyzing" && (
            <div className="bg-[#141414]/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6">
              <div className="flex items-center gap-3">
                <div className="animate-spin w-5 h-5 border-2 border-neutral-700 border-t-[#4AF262] rounded-full" />
                <span className="text-neutral-400">Analyzing commits...</span>
              </div>
            </div>
          )}

          {/* Clarifying Questions */}
          {generationPhase === "questions" && questions.length > 0 && (
            <ClarifyingQuestions
              questions={questions}
              onComplete={handleQuestionsComplete}
              onSkip={handleSkipQuestions}
            />
          )}

          {/* Generated Changelog */}
          {(changelog || generationPhase === "generating" || generateError) && (
            <div className="bg-[#141414]/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Result</h2>
                {changelog && generationPhase === "idle" && !generateError && (
                  <div className="flex gap-3 items-center">
                    <div className="flex gap-1 bg-neutral-900 p-1 rounded-lg">
                      <button
                        onClick={() => setEditorMode("edit")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          editorMode === "edit"
                            ? "bg-neutral-700 text-white"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setEditorMode("preview")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          editorMode === "preview"
                            ? "bg-neutral-700 text-white"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                    <button
                      onClick={handlePublish}
                      disabled={publishing || !!publishedUrl}
                      className="px-4 py-1.5 text-xs font-medium bg-[#4AF262]/15 border border-[#4AF262]/50 text-[#4AF262] rounded-lg hover:bg-[#4AF262]/25 hover:border-[#4AF262]/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {publishing ? "Publishing..." : publishedUrl ? "Published" : "Publish"}
                    </button>
                  </div>
                )}
              </div>
              <div
                ref={changelogRef}
                className="bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden"
              >
                {generateError ? (
                  <div className="p-4 text-sm text-neutral-500">
                    {generateError}
                  </div>
                ) : generationPhase === "generating" ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm p-4 max-h-96 overflow-y-auto text-neutral-300">
                    {changelog || "Generating..."}
                  </pre>
                ) : editorMode === "edit" ? (
                  <textarea
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    className="w-full h-96 p-4 text-sm font-mono resize-none focus:outline-none bg-transparent text-neutral-200"
                    placeholder="Your changelog will appear here..."
                  />
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none p-4 max-h-96 overflow-y-auto">
                    <ReactMarkdown>{changelog}</ReactMarkdown>
                  </div>
                )}
              </div>
              {publishedUrl && (
                <div className="mt-4 p-3 bg-[#4AF262]/10 border border-[#4AF262]/30 rounded-lg">
                  <p className="text-sm text-[#4AF262]">
                    Published successfully!{" "}
                    <a
                      href={publishedUrl}
                      className="underline hover:text-[#3DD855]"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View changelog
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
