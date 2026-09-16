//! lincom — состояние, клавиатура, диалоги ввода в стиле MC.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import { measure, render } from "./render";
import { applyTheme, currentTheme, toggleTheme } from "./theme";
import type { InputStage, Link, State } from "./types";

const state: State = {
  data: { folders: [], links: [] },
  panel: "left",
  currentFolderId: 0,
  leftCursor: 0,
  rightCursor: 0,
  input: null,
  confirm: null,
  theme: currentTheme(),
  sort: null,
};

const kbd = document.getElementById("kbd") as HTMLInputElement;

function visibleLinks(): Link[] {
  return state.data.links.filter((l) => l.folderId === state.currentFolderId);
}

function zeroId(): number {
  return state.data.folders.find((f) => f.isZero)?.id ?? 0;
}

function clampCursors(): void {
  const L = visibleLinks().length;
  const R = state.data.folders.length;
  state.leftCursor = L === 0 ? 0 : Math.min(state.leftCursor, L - 1);
  state.rightCursor = R === 0 ? 0 : Math.min(state.rightCursor, R - 1);
}

async function refresh(): Promise<void> {
  state.data = await api.load();
  clampCursors();
}

function redraw(): void {
  render(state);
}

function histGet(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`lincom.hist.${key}`) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function histPush(key: string, value: string): void {
  const v = value.trim();
  if (!v) return;
  const arr = histGet(key);
  if (arr[arr.length - 1] !== v) arr.push(v);
  localStorage.setItem(`lincom.hist.${key}`, JSON.stringify(arr.slice(-50)));
}

function startInput(stages: InputStage[], onDone: (values: string[]) => Promise<void>): void {
  state.input = { stages, idx: 0, draft: "", histPos: null, onDone };
  state.confirm = null;
  kbd.value = stages[0].value;
  kbd.focus();
  kbd.setSelectionRange(kbd.value.length, kbd.value.length);
  redraw();
}

function cancelInput(): void {
  state.input = null;
  kbd.blur();
  redraw();
}

function syncKbd(): void {
  kbd.value = state.input!.stages[state.input!.idx].value;
  kbd.setSelectionRange(kbd.value.length, kbd.value.length);
}

function histMove(dir: -1 | 1): void {
  const inp = state.input;
  if (!inp) return;
  const stage = inp.stages[inp.idx];
  const arr = histGet(stage.historyKey);
  if (arr.length === 0) return;

  if (inp.histPos === null) {
    if (dir === 1) return;
    inp.draft = stage.value;
    inp.histPos = arr.length - 1;
  } else {
    const next = inp.histPos + dir;
    if (next < 0) return;
    if (next >= arr.length) {
      inp.histPos = null;
      stage.value = inp.draft;
      syncKbd();
      redraw();
      return;
    }
    inp.histPos = next;
  }
  stage.value = arr[inp.histPos];
  syncKbd();
  redraw();
}

async function acceptStage(): Promise<void> {
  const inp = state.input;
  if (!inp) return;
  histPush(inp.stages[inp.idx].historyKey, inp.stages[inp.idx].value);

  if (inp.idx + 1 < inp.stages.length) {
    inp.idx += 1;
    inp.histPos = null;
    syncKbd();
    redraw();
    return;
  }
  const values = inp.stages.map((s) => s.value.trim());
  const done = inp.onDone;
  state.input = null;
  kbd.blur();
  await done(values);
  clampCursors();
  redraw();
}

function dialogCreateFolder(): void {
  startInput(
    [{ prompt: "directory name", historyKey: "folder.name", value: "" }],
    async ([name]) => {
      if (!name) return;
      const id = await api.createFolder(name);
      await refresh();
      state.panel = "right";
      state.rightCursor = Math.max(0, state.data.folders.findIndex((f) => f.id === id));
    },
  );
}

function dialogCreateLink(): void {
  startInput(
    [
      { prompt: "link name", historyKey: "link.title", value: "" },
      { prompt: "URL", historyKey: "link.url", value: "" },
      { prompt: "description", historyKey: "link.desc", value: "" },
    ],
    async ([title, url, desc]) => {
      if (!title || !url) return;
      const id = await api.createLink(state.currentFolderId, title, url, desc ?? "");
      await refresh();
      state.panel = "left";
      state.leftCursor = Math.max(0, visibleLinks().findIndex((l) => l.id === id));
    },
  );
}

function dialogEditFolder(id: number): void {
  const f = state.data.folders.find((x) => x.id === id);
  if (!f) return;
  startInput(
    [{ prompt: "directory name", historyKey: "folder.name", value: f.name }],
    async ([name]) => {
      if (!name || name === f.name) return;
      await api.updateFolder(f.id, name);
      await refresh();
    },
  );
}

function dialogEditLink(id: number): void {
  const l = state.data.links.find((x) => x.id === id);
  if (!l) return;
  startInput(
    [
      { prompt: "link name", historyKey: "link.title", value: l.title },
      { prompt: "URL", historyKey: "link.url", value: l.url },
      { prompt: "description", historyKey: "link.desc", value: l.description },
    ],
    async ([title, url, desc]) => {
      await api.updateLink(l.id, title || l.title, url || l.url, desc ?? "");
      await refresh();
    },
  );
}

function askDeleteLink(id: number): void {
  const l = state.data.links.find((x) => x.id === id);
  if (!l) return;
  state.confirm = {
    message: `Delete link "${l.title}"?`,
    action: async () => {
      await api.deleteLink(id);
      await refresh();
    },
  };
  redraw();
}

function askDeleteFolder(id: number): void {
  const f = state.data.folders.find((x) => x.id === id);
  if (!f || f.isZero) return;
  state.confirm = {
    message: `Delete folder "${f.name}" with its links?`,
    action: async () => {
      await api.deleteFolder(id);
      await refresh();
      if (state.currentFolderId === id) state.currentFolderId = zeroId();
    },
  };
  redraw();
}

async function toggleFav(id: number): Promise<void> {
  await api.toggleFavorite(id);
  await refresh();
}

function move(d: number): void {
  if (state.panel === "left") {
    const n = visibleLinks().length;
    if (n === 0) return;
    state.leftCursor = Math.max(0, Math.min(n - 1, state.leftCursor + d));
  } else {
    const n = state.data.folders.length;
    if (n === 0) return;
    state.rightCursor = Math.max(0, Math.min(n - 1, state.rightCursor + d));
  }
  redraw();
}

function activate(): void {
  if (state.panel === "left") {
    const l = visibleLinks()[state.leftCursor];
    if (l) void openUrl(l.url);
  } else {
    const f = state.data.folders[state.rightCursor];
    if (f) {
      state.currentFolderId = f.id;
      state.leftCursor = 0;
      state.panel = "left";
      redraw();
    }
  }
}

function backToZero(): void {
  if (state.confirm) {
    state.confirm = null;
    redraw();
    return;
  }
  if (state.currentFolderId !== zeroId()) {
    state.currentFolderId = zeroId();
    state.leftCursor = 0;
    redraw();
  }
}

function editCurrent(): void {
  if (state.panel === "left") {
    const l = visibleLinks()[state.leftCursor];
    if (l) dialogEditLink(l.id);
  } else {
    const f = state.data.folders[state.rightCursor];
    if (f) dialogEditFolder(f.id);
  }
}

function deleteCurrent(): void {
  if (state.panel === "left") {
    const l = visibleLinks()[state.leftCursor];
    if (l) askDeleteLink(l.id);
  } else {
    const f = state.data.folders[state.rightCursor];
    if (f) askDeleteFolder(f.id);
  }
}

function favCurrent(): void {
  if (state.panel === "left") {
    const l = visibleLinks()[state.leftCursor];
    if (l) void toggleFav(l.id);
  }
}

document.addEventListener("keydown", (e) => {
  if (state.input) return;

  if (state.confirm) {
    e.preventDefault();
    if (e.key === "y" || e.key === "Y") {
      const action = state.confirm.action;
      state.confirm = null;
      void action().then(() => {
        clampCursors();
        redraw();
      });
    } else {
      state.confirm = null;
      redraw();
    }
    return;
  }

  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  const ctrlShift = ctrl && e.shiftKey;
  const ctrlOnly = ctrl && !e.shiftKey;

  if (ctrlShift && e.code === "KeyN") { e.preventDefault(); dialogCreateFolder(); return; }
  if (ctrlShift && e.code === "KeyT") { e.preventDefault(); state.theme = toggleTheme(); redraw(); return; }
  if (ctrlOnly && e.code === "KeyN") { e.preventDefault(); dialogCreateLink(); return; }
  if (ctrlOnly && e.code === "KeyR") { e.preventDefault(); editCurrent(); return; }
  if (ctrlOnly && e.code === "KeyQ") { e.preventDefault(); void getCurrentWindow().close(); return; }
  if (ctrlOnly && e.code === "KeyF") { e.preventDefault(); favCurrent(); return; }

  switch (e.code) {
    case "ArrowLeft":
    case "ArrowRight":
    case "Tab":
      e.preventDefault();
      state.panel = state.panel === "left" ? "right" : "left";
      redraw();
      return;
    case "ArrowUp": e.preventDefault(); move(-1); return;
    case "ArrowDown": e.preventDefault(); move(1); return;
    case "Home": e.preventDefault(); state.panel === "left" ? (state.leftCursor = 0) : (state.rightCursor = 0); redraw(); return;
    case "End": e.preventDefault(); state.panel === "left" ? (state.leftCursor = visibleLinks().length - 1) : (state.rightCursor = state.data.folders.length - 1); clampCursors(); redraw(); return;
    case "Enter": e.preventDefault(); activate(); return;
    case "Escape": e.preventDefault(); backToZero(); return;
    case "Delete": e.preventDefault(); deleteCurrent(); return;
    default: return;
  }
});

kbd.addEventListener("keydown", (e) => {
  if (!state.input) return;
  if (e.key === "Enter") { e.preventDefault(); void acceptStage(); }
  else if (e.key === "Escape") { e.preventDefault(); cancelInput(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); histMove(-1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); histMove(1); }
});

kbd.addEventListener("input", () => {
  const inp = state.input;
  if (!inp) return;
  inp.stages[inp.idx].value = kbd.value;
  inp.histPos = null;
  redraw();
});

document.getElementById("btn-min")?.addEventListener("click", () => {
  void getCurrentWindow().minimize();
});
document.getElementById("btn-close")?.addEventListener("click", () => {
  void getCurrentWindow().close();
});

async function init(): Promise<void> {
  applyTheme(state.theme);
  measure();
  await refresh();
  state.currentFolderId = zeroId();
  redraw();
}

window.addEventListener("resize", () => redraw());
void init();
