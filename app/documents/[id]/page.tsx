import { notFound } from "next/navigation";

import { DocumentInteractionPage } from "@/components/document-interaction-page";
import { getDocumentDetailSnapshot } from "@/lib/server/documents";

export default async function DocumentDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const initialPage = Number.parseInt(page ?? "1", 10);
  const snapshot = await getDocumentDetailSnapshot(id);

  if (!snapshot) {
    notFound();
  }

  return (
    <DocumentInteractionPage
      snapshot={snapshot}
      initialPage={Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1}
    />
  );
}
