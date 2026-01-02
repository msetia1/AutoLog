"use client";

import { Timeline } from "@/components/ui/timeline";
import ReactMarkdown from "react-markdown";

interface ChangelogEntry {
  id: string;
  date: string;
  content: string;
  created_at: string;
}

export function ChangelogTimeline({ entries }: { entries: ChangelogEntry[] }) {
  const data = entries.map((entry) => ({
    title: new Date(entry.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    content: (
      <div className="prose prose-sm prose-invert max-w-none">
        <ReactMarkdown>{entry.content}</ReactMarkdown>
      </div>
    ),
  }));

  return <Timeline data={data} />;
}
