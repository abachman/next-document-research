"use client";

import { markdownToHtml } from "@/lib/markdown";

export function MarkdownPreview({ value }: { value: string }) {
  const html = markdownToHtml(value || "");

  return (
    <div
      className="prose prose-sm max-w-none text-sm text-neutral-700"
      dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
    />
  );
}
