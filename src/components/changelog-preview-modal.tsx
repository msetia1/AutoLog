"use client";

import { Timeline } from "@/components/ui/timeline";
import ReactMarkdown from "react-markdown";
import { X } from "lucide-react";

interface ChangelogEntry {
  id: string;
  date: string;
  content: string;
  created_at: string;
}

interface ChangelogPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftContent: string;
  publishedEntries: ChangelogEntry[];
  repoName: string;
}

export function ChangelogPreviewModal({
  isOpen,
  onClose,
  draftContent,
  publishedEntries,
  repoName,
}: ChangelogPreviewModalProps) {
  if (!isOpen) return null;

  const fontFamily = '"Mona Sans", "Mona Sans Fallback", -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif';

  // Create draft entry with current date
  const draftEntry = {
    id: "draft",
    date: new Date().toISOString(),
    content: draftContent,
    created_at: new Date().toISOString(),
  };

  // Combine draft (at top) with published entries
  const allEntries = [draftEntry, ...publishedEntries];

  const data = allEntries.map((entry) => ({
    title: new Date(entry.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    content: (
      <div className="relative">
        {entry.id === "draft" && (
          <span className="absolute -top-6 left-0 text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
            Draft Preview
          </span>
        )}
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{entry.content}</ReactMarkdown>
        </div>
      </div>
    ),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full h-full max-w-5xl max-h-[90vh] mx-4 bg-neutral-950 rounded-2xl overflow-hidden flex flex-col"
        style={{ fontFamily }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-neutral-800">
          <div>
            <h2 className="text-2xl font-bold text-white">{repoName}</h2>
            <p className="text-neutral-400 text-sm">Changelog Preview</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-neutral-500">No changelog entries</p>
            </div>
          ) : (
            <Timeline data={data} />
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-neutral-800 bg-neutral-950">
          <p className="text-xs text-neutral-500 text-center">
            This is a preview of how your changelog will appear when published
          </p>
        </div>
      </div>
    </div>
  );
}
