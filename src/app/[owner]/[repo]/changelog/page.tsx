import { createServerClient } from "@/lib/supabase/server";
import ReactMarkdown from "react-markdown";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  return {
    title: `${owner}/${repo} Changelog`,
    description: `Changelog for ${owner}/${repo}`,
  };
}

export default async function ChangelogPage({ params }: Props) {
  const { owner, repo } = await params;
  const supabase = await createServerClient();

  // Find the repo
  const { data: repoData } = await supabase
    .from("repos")
    .select("id")
    .eq("owner", owner)
    .eq("name", repo)
    .single();

  if (!repoData) {
    notFound();
  }

  // Fetch published changelog entries (sorted by created_at for correct ordering)
  const { data: entries } = await supabase
    .from("changelog_entries")
    .select("*")
    .eq("repo_id", repoData.id)
    .eq("published", true)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-2">
            {owner}/{repo}
          </h1>
          <p className="text-muted-foreground">Changelog</p>
        </div>

        {/* Entries */}
        {!entries || entries.length === 0 ? (
          <p className="text-muted-foreground">No changelog entries yet.</p>
        ) : (
          <div className="space-y-12">
            {entries.map((entry) => (
              <article key={entry.id} className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <time className="text-sm font-medium text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <div className="neo-card bg-white p-6 rounded-md">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{entry.content}</ReactMarkdown>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-sm text-muted-foreground text-center">
            Generated with{" "}
            <a href="/" className="underline hover:text-black">
              AutoLog
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
