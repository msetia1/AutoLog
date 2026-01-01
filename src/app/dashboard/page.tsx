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
import type { Repo, Commit } from "@/lib/github";

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [changelog, setChangelog] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const changelogRef = useRef<HTMLDivElement>(null);

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

  // Generate changelog with streaming
  async function handleGenerate() {
    if (!selectedRepo || commits.length === 0) return;

    const [owner, repo] = selectedRepo.split("/");
    setGenerating(true);
    setChangelog("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate changelog");
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
    } finally {
      setGenerating(false);
    }
  }

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="neo-button bg-white px-4 py-2 rounded-md text-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Repo selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Select Repository</label>
          <Select onValueChange={handleRepoSelect} value={selectedRepo}>
            <SelectTrigger className="w-full max-w-md neo-card">
              <SelectValue placeholder={loadingRepos ? "Loading repos..." : "Choose a repository"} />
            </SelectTrigger>
            <SelectContent>
              {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.full_name}>
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
              <h2 className="text-xl font-semibold">
                Commits {loadingCommits && "(loading...)"}
              </h2>
              {commits.length > 0 && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="neo-button bg-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate Changelog"}
                </button>
              )}
            </div>

            {commits.length === 0 && !loadingCommits && (
              <p className="text-muted-foreground">No commits found.</p>
            )}

            {/* Generated changelog */}
            {(changelog || generating) && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Generated Changelog</h3>
                  {changelog && !generating && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditorMode("edit")}
                        className={`px-3 py-1 text-sm rounded-md border-2 border-black ${
                          editorMode === "edit" ? "bg-black text-white" : "bg-white"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setEditorMode("preview")}
                        className={`px-3 py-1 text-sm rounded-md border-2 border-black ${
                          editorMode === "preview" ? "bg-black text-white" : "bg-white"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  )}
                </div>
                <div
                  ref={changelogRef}
                  className="neo-card bg-white rounded-md overflow-hidden"
                >
                  {generating ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm p-4 max-h-96 overflow-y-auto">
                      {changelog || "Generating..."}
                    </pre>
                  ) : editorMode === "edit" ? (
                    <textarea
                      value={changelog}
                      onChange={(e) => setChangelog(e.target.value)}
                      className="w-full h-96 p-4 text-sm font-mono resize-none focus:outline-none"
                      placeholder="Your changelog will appear here..."
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none p-4 max-h-96 overflow-y-auto">
                      <ReactMarkdown>{changelog}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {commits.map((commit) => (
                <div key={commit.sha} className="neo-card bg-white p-4 rounded-md">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium">{commit.commit.message.split("\n")[0]}</p>
                    <code className="text-xs text-muted-foreground">
                      {commit.sha.slice(0, 7)}
                    </code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {commit.commit.author.name} • {new Date(commit.commit.author.date).toLocaleDateString()}
                  </p>

                  {/* Files changed */}
                  {commit.files && commit.files.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer text-muted-foreground">
                        {commit.files.length} file(s) changed
                      </summary>
                      <div className="mt-2 space-y-2">
                        {commit.files.map((file, i) => (
                          <div key={i} className="text-xs bg-muted p-2 rounded">
                            <div className="flex justify-between">
                              <span className="font-mono">{file.filename}</span>
                              <span>
                                <span className="text-green-600">+{file.additions}</span>
                                {" "}
                                <span className="text-red-600">-{file.deletions}</span>
                              </span>
                            </div>
                            {file.patch && (
                              <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
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
