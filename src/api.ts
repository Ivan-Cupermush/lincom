//! Обёртки над Tauri-командами бэкенда.

import { invoke } from "@tauri-apps/api/core";
import type { AppData } from "./types";

export const api = {
  load: (): Promise<AppData> => invoke<AppData>("load_all"),
  createFolder: (name: string): Promise<number> =>
    invoke<number>("create_folder", { name }),
  createLink: (
    folderId: number,
    title: string,
    url: string,
    description: string,
  ): Promise<number> =>
    invoke<number>("create_link", { folderId, title, url, description }),
  updateFolder: (id: number, name: string): Promise<void> =>
    invoke<void>("update_folder", { id, name }),
  updateLink: (
    id: number,
    title: string,
    url: string,
    description: string,
  ): Promise<void> => invoke<void>("update_link", { id, title, url, description }),
  toggleFavorite: (id: number): Promise<boolean> =>
    invoke<boolean>("toggle_favorite", { id }),
  deleteFolder: (id: number): Promise<void> => invoke<void>("delete_folder", { id }),
  deleteLink: (id: number): Promise<void> => invoke<void>("delete_link", { id }),
};
