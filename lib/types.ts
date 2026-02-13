export type DocumentRow = {
  id: string;
  title: string;
  sourceName: string;
  pageCount: number;
  descriptionMd: string;
  filePath: string;
  mimeType: string;
  byteSize: number;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
};

export type NoteRow = {
  id: string;
  documentId: string;
  page: number;
  quote: string;
  content: string;
  contentMd: string;
  selectionRectsJson: string;
  createdAt: number;
};

export type TagRow = {
  id: string;
  name: string;
  createdAt: number;
};

export type DocumentTagRow = {
  documentId: string;
  tagId: string;
};

export type NoteTagRow = {
  noteId: string;
  tagId: string;
};

export type NoteLinkRow = {
  id: string;
  noteId: string;
  linkedDocumentId: string;
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

export type DocumentListItem = {
  id: string;
  title: string;
  byteSize: number;
  pageCount: number;
  wordCount: number;
  descriptionMd: string;
  createdAt: number;
  tags: string[];
};

export type NoteDetail = {
  id: string;
  documentId: string;
  page: number;
  quote: string;
  contentMd: string;
  tags: string[];
  linkedDocuments: Array<{ id: string; title: string }>;
  createdAt: number;
};

export type DocumentDetailSnapshot = {
  document: DocumentRow;
  tags: string[];
  allTags: string[];
  notes: NoteDetail[];
  allDocuments: Array<{ id: string; title: string }>;
};

export type DocumentSearchHit = {
  documentId: string;
  title: string;
  page: number | null;
  score: number;
  reasons: Array<"keyword" | "semantic">;
  snippet: string;
};

export type DocumentsPageSnapshot = {
  documents: DocumentListItem[];
  tags: string[];
};
