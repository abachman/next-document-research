export type DocumentRow = {
  id: string;
  title: string;
  sourceName: string;
  pageCount: number;
  createdAt: number;
};

export type NoteRow = {
  id: string;
  documentId: string;
  page: number;
  quote: string;
  content: string;
  createdAt: number;
};

export type HighlightRow = {
  id: string;
  documentId: string;
  page: number;
  color: string;
  text: string;
  rectsJson: string;
  createdAt: number;
};

export type SearchResult = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageStart: number;
  pageEnd: number;
  snippet: string;
  distance: number | null;
};

export type WorkspaceSnapshot = {
  documents: DocumentRow[];
  notes: NoteRow[];
};
