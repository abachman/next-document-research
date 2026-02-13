import { DocumentsPage } from "@/components/documents-page";
import { getDocumentsPageSnapshot } from "@/lib/server/documents";

export default async function DocumentsRoute() {
  const snapshot = await getDocumentsPageSnapshot();
  return <DocumentsPage initialSnapshot={snapshot} />;
}
