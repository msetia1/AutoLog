"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Repo, Commit } from "@/lib/github";

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingCommits, setLoadingCommits] = useState(false);

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
            <h2 className="text-xl font-semibold mb-4">
              Commits {loadingCommits && "(loading...)"}
            </h2>

            {commits.length === 0 && !loadingCommits && (
              <p className="text-muted-foreground">No commits found.</p>
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
