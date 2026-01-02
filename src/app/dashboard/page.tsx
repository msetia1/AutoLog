"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { ClarifyingQuestions } from "@/components/clarifying-questions";
import type { Repo, Commit } from "@/lib/github";
import type { ClarifyingQuestion } from "@/lib/openrouter";

type GenerationPhase = "idle" | "analyzing" | "questions" | "generating";

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

  // New state for smart generation
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>({});

  // Range options for the dropdown
  const rangeOptions = [
    { value: "days-7", label: "Last 7 days" },
    { value: "days-30", label: "Last 30 days" },
    { value: "days-90", label: "Last 90 days" },
    { value: "commits-25", label: "Last 25 commits" },
    { value: "commits-50", label: "Last 50 commits" },
  ];

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [session, isPending, router]);

  // Fetch repos on mount
  useEffect(() => {
    async function loadRepos() {
      try {
        const res = await fetch("/api/repos");
        if (res.ok) {
          const data = await res.json();
          setRepos(data);
        }
      } catch (err) {
        console.error("Failed to fetch repos:", err);
      } finally {
        setLoadingRepos(false);
      }
    }

    if (session) {
      loadRepos();
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

  // Helper to build params for API calls
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
      // Fetch clarifying questions
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
        // If questions fail, fall back to direct generation
        console.log("Questions fetch failed, falling back to direct generation");
        await generateFinalChangelog({});
        return;
      }

      const data = await res.json();

      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setGenerationPhase("questions");
      } else {
        // No questions to ask, proceed directly to generation
        await generateFinalChangelog({});
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
      // Fall back to direct generation
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

        // Auto-scroll to bottom
        if (changelogRef.current) {
          changelogRef.current.scrollTop = changelogRef.current.scrollHeight;
        }
      }
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
    } catch (err) {
      console.error("Failed to publish changelog:", err);
    } finally {
      setPublishing(false);
    }
  }

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold text-white tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-neutral-400">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="btn-secondary px-4 py-2 rounded-lg text-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Repo selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-neutral-300 mb-2">Select Repository</label>
          <Select onValueChange={handleRepoSelect} value={selectedRepo}>
            <SelectTrigger className="w-full max-w-md card bg-neutral-900 border-neutral-800 text-white">
              <SelectValue placeholder={loadingRepos ? "Loading repos..." : "Choose a repository"} />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.full_name} className="text-white hover:bg-neutral-800">
                  {repo.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Commits display */}
        {selectedRepo && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">
                Commits {loadingCommits && <span className="text-neutral-500">(loading...)</span>}
              </h2>
            </div>

            {commits.length === 0 && !loadingCommits && (
              <p className="text-neutral-500">No commits found.</p>
            )}

            {/* Generation controls */}
            {commits.length > 0 && (
              <div className="mb-6 space-y-4">
                {/* Additional context textarea */}
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-2">
                    Additional context (optional)
                  </label>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="e.g., 'Focus on user-facing features. Skip internal refactoring. Audience is non-technical.'"
                    className="w-full h-20 px-3 py-2 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-700 resize-none"
                    disabled={generationPhase !== "idle"}
                  />
                </div>

                {/* Range selector and generate button */}
                <div className="flex items-center gap-3">
                  <Select value={rangeType} onValueChange={setRangeType} disabled={generationPhase !== "idle"}>
                    <SelectTrigger className="w-40 bg-neutral-900 border-neutral-800 text-white rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-neutral-800">
                      {rangeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-white hover:bg-neutral-800">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleGenerate}
                    disabled={generationPhase !== "idle"}
                    className="btn-primary px-4 py-2 rounded-lg text-sm"
                  >
                    {generationPhase === "analyzing" ? "Analyzing..." :
                     generationPhase === "generating" ? "Generating..." :
                     "Generate Changelog"}
                  </button>
                </div>
              </div>
            )}

            {/* Analyzing state */}
            {generationPhase === "analyzing" && (
              <div className="mb-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                <div className="flex items-center gap-3">
                  <div className="animate-spin w-5 h-5 border-2 border-neutral-700 border-t-blue-500 rounded-full" />
                  <span className="text-neutral-300">Analyzing commits...</span>
                </div>
              </div>
            )}

            {/* Clarifying questions */}
            {generationPhase === "questions" && questions.length > 0 && (
              <div className="mb-6">
                <ClarifyingQuestions
                  questions={questions}
                  onComplete={handleQuestionsComplete}
                  onSkip={handleSkipQuestions}
                />
              </div>
            )}

            {/* Generated changelog */}
            {(changelog || generationPhase === "generating" || generateError) && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold text-white">Generated Changelog</h3>
                  {changelog && generationPhase === "idle" && !generateError && (
                    <div className="flex gap-2">
                      <div className="flex gap-1 bg-neutral-900 p-1 rounded-lg">
                        <button
                          onClick={() => setEditorMode("edit")}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            editorMode === "edit"
                              ? "bg-neutral-700 text-white"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setEditorMode("preview")}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
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
                        className="btn-primary px-4 py-1 rounded-lg text-sm"
                      >
                        {publishing ? "Publishing..." : publishedUrl ? "Published" : "Publish"}
                      </button>
                    </div>
                  )}
                </div>
                <div
                  ref={changelogRef}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
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
                      className="w-full h-96 p-4 text-sm font-mono resize-none focus:outline-none bg-neutral-900 text-neutral-200"
                      placeholder="Your changelog will appear here..."
                    />
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none p-4 max-h-96 overflow-y-auto">
                      <ReactMarkdown>{changelog}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {publishedUrl && (
                  <div className="mt-3 p-3 bg-green-950 border border-green-800 rounded-lg">
                    <p className="text-sm text-green-400">
                      Published successfully!{" "}
                      <a
                        href={publishedUrl}
                        className="underline font-medium hover:text-green-300"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View changelog →
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {commits.map((commit) => (
                <div key={commit.sha} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-white">{commit.commit.message.split("\n")[0]}</p>
                    <code className="text-xs text-neutral-500 font-mono">
                      {commit.sha.slice(0, 7)}
                    </code>
                  </div>
                  <p className="text-sm text-neutral-500 mb-2">
                    {commit.commit.author.name} • {new Date(commit.commit.author.date).toLocaleDateString()}
                  </p>

                  {/* Files changed */}
                  {commit.files && commit.files.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer text-neutral-400 hover:text-neutral-300">
                        {commit.files.length} file(s) changed
                      </summary>
                      <div className="mt-2 space-y-2">
                        {commit.files.map((file, i) => (
                          <div key={i} className="text-xs bg-neutral-800 p-2 rounded-lg">
                            <div className="flex justify-between">
                              <span className="font-mono text-neutral-300">{file.filename}</span>
                              <span>
                                <span className="text-green-500">+{file.additions}</span>
                                {" "}
                                <span className="text-red-500">-{file.deletions}</span>
                              </span>
                            </div>
                            {file.patch && (
                              <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap text-neutral-400">
                                {file.patch.slice(0, 500)}
                                {file.patch.length > 500 && "..."}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
