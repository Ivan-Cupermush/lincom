//! Общие типы фронтенда.

export interface Folder {
  id: number;
  name: string;
  isZero: boolean;
}

export interface Link {
  id: number;
  folderId: number;
  title: string;
  url: string;
  description: string;
}

export interface AppData {
  folders: Folder[];
  links: Link[];
}

export type Panel = "left" | "right";

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
  onDone: (values: string[]) => Promise<void>;
}

export interface ConfirmState {
  message: string;
  action: () => Promise<void>;
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
}
