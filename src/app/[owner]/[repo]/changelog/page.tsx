import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChangelogTimeline } from "@/components/changelog-timeline";

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

  const fontFamily = '"Mona Sans", "Mona Sans Fallback", -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

  return (
    <div className="min-h-screen bg-neutral-950" style={{ fontFamily }}>
      {/* Header */}
      <div className="max-w-7xl mx-auto pt-16 px-4 md:px-8 lg:px-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
          {repo}
        </h1>
        <p className="text-neutral-400">Changelog</p>
      </div>

      {/* Timeline */}
      {!entries || entries.length === 0 ? (
        <div className="max-w-7xl mx-auto py-20 px-4 md:px-8 lg:px-10">
          <p className="text-neutral-500">No changelog entries yet.</p>
        </div>
      ) : (
        <ChangelogTimeline entries={entries} />
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 py-12 border-t border-neutral-800">
        <p className="text-sm text-neutral-500 text-center">
          Generated with{" "}
          <a href="/" className="text-neutral-400 hover:text-white transition-colors">
            AutoLog
          </a>
        </p>
      </footer>
    </div>
  );
}
