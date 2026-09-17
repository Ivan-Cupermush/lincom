//! Общие типы фронтенда.

export interface Folder {
  id: number;
  name: string;
  isZero: boolean;
  sortOrder: number;
}

export interface Link {
  id: number;
  folderId: number;
  title: string;
  url: string;
  description: string;
  isFavorite: boolean;
  updatedAt: string;
}

export interface AppData {
  folders: Folder[];
  links: Link[];
}

export type Panel = "left" | "right";

export type SortColumn = "title" | "updatedAt";
export type SortDirection = "asc" | "desc";

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface InputStage {
  prompt: string;
  historyKey: string;
  value: string;
}

export interface InputState {
  stages: InputStage[];
  idx: number;
  draft: string;
  histPos: number | null;
  caret: number;
  selAnchor: number | null;
  onDone: (values: string[]) => Promise<void>;
}

export interface ConfirmState {
  message: string;
  pendingInput: string;
  action: () => Promise<void>;
}

export interface ReorderState {
  active: boolean;
  cursor: number;
}

//! Поиск в стиле Windows Explorer / Chrome omnibox.
export interface SearchState {
  active: boolean;
  query: string;
  caret: number;
  selAnchor: number | null;
  resultCursor: number;
  results: Link[];
}

export interface State {
  data: AppData;
  panel: Panel;
  currentFolderId: number;
  leftCursor: number;
  rightCursor: number;
  input: InputState | null;
  confirm: ConfirmState | null;
  theme: "light" | "dark";
  sort: SortState | null;
  selectedLinks: Set<number>;
  spaceHeld: boolean;
  reorder: ReorderState;
  search: SearchState;
}
