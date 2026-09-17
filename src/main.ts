//! lincom — состояние, клавиатура, диалоги ввода, поиск.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "./api";
import { measure, render, sortLinks, metrics } from "./render";
import { applyTheme, currentTheme, toggleTheme } from "./theme";
import type { InputStage, InputState, Link, SortColumn, State } from "./types";

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
  selectedLinks: new Set(),
  spaceHeld: false,
  reorder: { active: false, cursor: 0 },
  search: { active: false, query: "", caret: 0, selAnchor: null, resultCursor: 0, results: [] },
  opacityPct: 100,
};

const kbd = document.getElementById("kbd") as HTMLInputElement;

function visibleLinks(): Link[] {
  const raw = state.data.links.filter((l) => l.folderId === state.currentFolderId);
  return sortLinks(raw, state.sort);
}

function zeroId(): number {
  return state.data.folders.find((f) => f.isZero)?.id ?? 0;
}

function clampCursors(): void {
  const L = visibleLinks().length;
  const R = state.data.folders.length;
  state.leftCursor = L === 0 ? 0 : Math.min(state.leftCursor, L - 1);
  state.rightCursor = R === 0 ? 0 : Math.min(state.rightCursor, R - 1);
  if (state.reorder.active) {
    state.reorder.cursor = Math.max(1, Math.min(state.reorder.cursor, R - 1));
  }
}

async function refresh(): Promise<void> {
  state.data = await api.load();
  clampCursors();
}

function redraw(): void {
  render(state);
}

function maybeClearSelection(exempt: boolean): void {
  if (exempt || state.spaceHeld) return;
  if (state.selectedLinks.size > 0) {
    state.selectedLinks.clear();
    redraw();
  }
}

function toggleSort(col: SortColumn): void {
  if (!state.sort || state.sort.column !== col) state.sort = { column: col, direction: "asc" };
  else if (state.sort.direction === "asc") state.sort = { column: col, direction: "desc" };
  else state.sort = null;
  redraw();
}

function selRange(inp: InputState): [number, number] {
  const v = inp.stages[inp.idx].value;
  const caret = Math.max(0, Math.min(inp.caret, v.length));
  if (inp.selAnchor === null) return [caret, caret];
  const anchor = Math.max(0, Math.min(inp.selAnchor, v.length));
  return [Math.min(anchor, caret), Math.max(anchor, caret)];
}

function syncKbdSelection(): void {
  const inp = state.input;
  if (!inp) return;
  const [a, b] = selRange(inp);
  kbd.setSelectionRange(a, b);
}

function resyncCaretFromKbd(): void {
  const inp = state.input;
  if (!inp) return;
  inp.stages[inp.idx].value = kbd.value;
  inp.caret = kbd.selectionStart ?? kbd.value.length;
  inp.selAnchor = null;
  inp.histPos = null;
}

function setCaretEnd(): void {
  const inp = state.input;
  if (!inp) return;
  inp.caret = inp.stages[inp.idx].value.length;
  inp.selAnchor = null;
  kbd.value = inp.stages[inp.idx].value;
  kbd.setSelectionRange(inp.caret, inp.caret);
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
  state.input = {
    stages,
    idx: 0,
    draft: "",
    histPos: null,
    caret: stages[0].value.length,
    selAnchor: null,
    onDone,
  };
  state.confirm = null;
  kbd.value = stages[0].value;
  kbd.focus();
  kbd.setSelectionRange(stages[0].value.length, stages[0].value.length);
  redraw();
}

function cancelInput(): void {
  state.input = null;
  kbd.blur();
  redraw();
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
      setCaretEnd();
      redraw();
      return;
    }
    inp.histPos = next;
  }
  stage.value = arr[inp.histPos];
  setCaretEnd();
  redraw();
}

async function acceptStage(): Promise<void> {
  const inp = state.input;
  if (!inp) return;
  histPush(inp.stages[inp.idx].historyKey, inp.stages[inp.idx].value);

  if (inp.idx + 1 < inp.stages.length) {
    inp.idx += 1;
    inp.histPos = null;
    setCaretEnd();
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
    pendingInput: "",
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
    pendingInput: "",
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
  const idx = visibleLinks().findIndex((l) => l.id === id);
  if (idx >= 0) state.leftCursor = idx;
  redraw();
}

function move(d: number): void {
  if (state.reorder.active) {
    const n = state.data.folders.length;
    const old = state.reorder.cursor;
    const next = old + d;
    if (next < 1 || next >= n) return;
    const arr = [...state.data.folders];
    [arr[old], arr[next]] = [arr[next], arr[old]];
    state.data.folders = arr;
    state.reorder.cursor = next;
    redraw();
    return;
  }

  if (state.panel === "left") {
    const n = visibleLinks().length;
    if (n === 0) return;
    const old = state.leftCursor;
    state.leftCursor = Math.max(0, Math.min(n - 1, state.leftCursor + d));
    if (state.spaceHeld) {
      const links = visibleLinks();
      if (links[old]) state.selectedLinks.add(links[old].id);
      if (links[state.leftCursor]) state.selectedLinks.add(links[state.leftCursor].id);
    }
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
    if (l) {
      void openUrl(l.url);
      redraw();
    }
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

async function copyLinks(): Promise<void> {
  if (state.panel !== "left") return;
  const links = visibleLinks();
  let toCopy: Link[];
  if (state.selectedLinks.size > 0) {
    toCopy = links.filter((l) => state.selectedLinks.has(l.id));
  } else {
    const l = links[state.leftCursor];
    if (!l) return;
    toCopy = [l];
  }
  const text = toCopy.map((l) => `[${l.title}]: ${l.url}`).join("\n");
  await writeText(text);
  state.selectedLinks.clear();
  redraw();
}

function jumpToFolder(num: number): void {
  const f = state.data.folders[num];
  if (f) {
    state.currentFolderId = f.id;
    state.leftCursor = 0;
    state.panel = "left";
    redraw();
  }
}

function toggleReorder(): void {
  if (state.reorder.active) {
    const ids = state.data.folders.map((f) => f.id);
    void api.reorderFolders(ids).then(async () => {
      await refresh();
      state.reorder.active = false;
      redraw();
    });
  } else {
    if (state.data.folders.length <= 1) return;
    state.reorder.active = true;
    state.reorder.cursor = Math.max(1, Math.min(state.rightCursor, state.data.folders.length - 1));
    state.panel = "right";
    redraw();
  }
}

function searchSelRange(): [number, number] {
  const s = state.search;
  const caret = Math.max(0, Math.min(s.caret, s.query.length));
  if (s.selAnchor === null) return [caret, caret];
  const an = Math.max(0, Math.min(s.selAnchor, s.query.length));
  return [Math.min(an, caret), Math.max(an, caret)];
}

function syncSearchSelection(): void {
  const [a, b] = searchSelRange();
  kbd.setSelectionRange(a, b);
}

function computeSearchResults(): void {
  const q = state.search.query.trim().toLowerCase();
  if (!q) {
    state.search.results = [];
    return;
  }
  const scored: Array<{ l: Link; s: number }> = [];
  for (const l of state.data.links) {
    const t = l.title.toLowerCase();
    const u = l.url.toLowerCase();
    const d = l.description.toLowerCase();
    let s = -1;
    if (t.startsWith(q)) s = 0;
    else if (t.includes(q)) s = 1;
    else if (u.includes(q)) s = 2;
    else if (d.includes(q)) s = 3;
    if (s >= 0) scored.push({ l, s });
  }
  scored.sort(
    (x, y) =>
      x.s - y.s ||
      (x.l.isFavorite === y.l.isFavorite ? 0 : x.l.isFavorite ? -1 : 1) ||
      x.l.title.localeCompare(y.l.title),
  );
  state.search.results = scored.map((x) => x.l);
}

function openSearch(): void {
  state.input = null;
  state.confirm = null;
  const s = state.search;
  s.active = true;
  s.query = "";
  s.caret = 0;
  s.selAnchor = null;
  s.resultCursor = 0;
  s.results = [];
  kbd.value = "";
  kbd.focus();
  kbd.setSelectionRange(0, 0);
  redraw();
}

function closeSearch(): void {
  state.search.active = false;
  kbd.blur();
  redraw();
}

function handleSearchKey(e: KeyboardEvent): void {
  const s = state.search;
  const len = s.query.length;
  const clampPos = (p: number): number => Math.max(0, Math.min(len, p));
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;

  if (ctrl && e.code === "KeyS") { e.preventDefault(); closeSearch(); return; }
  if (e.key === "Escape") { e.preventDefault(); closeSearch(); return; }
  if (e.key === "Enter") { e.preventDefault(); searchJump(); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); if (s.results.length) s.resultCursor = Math.min(s.results.length - 1, s.resultCursor + 1); redraw(); return; }
  if (e.key === "ArrowUp") { e.preventDefault(); s.resultCursor = Math.max(0, s.resultCursor - 1); redraw(); return; }

  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
    e.preventDefault();
    const [a, b] = searchSelRange();
    const hasSel = a !== b;
    if (e.shiftKey) {
      if (s.selAnchor === null) s.selAnchor = s.caret;
      let next = s.caret;
      if (e.key === "ArrowLeft") next = s.caret - 1;
      else if (e.key === "ArrowRight") next = s.caret + 1;
      else if (e.key === "Home") next = 0;
      else next = len;
      s.caret = clampPos(next);
    } else {
      if (hasSel && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        s.caret = e.key === "ArrowLeft" ? a : b;
      } else {
        let next = s.caret;
        if (e.key === "ArrowLeft") next = s.caret - 1;
        else if (e.key === "ArrowRight") next = s.caret + 1;
        else if (e.key === "Home") next = 0;
        else next = len;
        s.caret = clampPos(next);
      }
      s.selAnchor = null;
    }
    syncSearchSelection();
    redraw();
    return;
  }

  if (ctrl && e.code === "KeyA") { e.preventDefault(); s.selAnchor = 0; s.caret = len; syncSearchSelection(); redraw(); return; }
  if (ctrl && e.code === "KeyC") { e.preventDefault(); const [a, b] = searchSelRange(); if (a !== b) void writeText(s.query.slice(a, b)); return; }

  syncSearchSelection();
}

function searchJump(): void {
  const l = state.search.results[state.search.resultCursor];
  if (!l) {
    closeSearch();
    return;
  }
  const folderId = l.folderId;
  const linkId = l.id;
  closeSearch();
  state.currentFolderId = folderId;
  state.panel = "left";
  state.leftCursor = Math.max(0, visibleLinks().findIndex((x) => x.id === linkId));
  redraw();
}

/* ---------------- прозрачность: 10 ступеней 30..100 ---------------- */

const OPACITY_LEVELS = [30, 38, 46, 53, 61, 69, 77, 84, 92, 100];
let opacityIdx = (() => {
  const v = parseInt(localStorage.getItem("lincom.opacity") ?? "", 10);
  const i = OPACITY_LEVELS.indexOf(v);
  return i >= 0 ? i : OPACITY_LEVELS.length - 1;
})();

function applyOpacity(): void {
  state.opacityPct = OPACITY_LEVELS[opacityIdx];
  // Нативный setOpacity в Tauri на Linux не реализован (команда вырезана
  // платформенно), поэтому используем CSS-opacity на body: окно уже
  // прозрачное (transparent: true), значит альфа контента даёт настоящую
  // сквозную прозрачность на любой платформе, включая Wayland.
  document.body.style.opacity = (state.opacityPct / 100).toFixed(2);
}

function opacityStep(d: number): void {
  opacityIdx = Math.max(0, Math.min(OPACITY_LEVELS.length - 1, opacityIdx + d));
  localStorage.setItem("lincom.opacity", String(OPACITY_LEVELS[opacityIdx]));
  applyOpacity();
  redraw();
}

/* ---------------- снап размера окна к целым строкам/колонкам ---------------- */

const CHROME_H = 30 + 24 + 44; // titlebar + cmdline + hotkeys (2 слоя)
let snapTimer: number | undefined;
let snapping = false;

function scheduleSnap(): void {
  if (snapTimer !== undefined) window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => {
    void snapWindow();
  }, 150);
}

async function snapWindow(): Promise<void> {
  if (snapping) return;
  snapping = true;
  try {
    const win = getCurrentWindow();
    const phys = await win.innerSize();
    const scale = await win.scaleFactor();
    const m = metrics();
    const lw = phys.width / scale;
    const lh = phys.height / scale;
    const panelsH = lh - CHROME_H;
    if (!(lw > 0) || !(panelsH > 0)) return;
    const cols = Math.max(40, Math.round(lw / m.charW));
    const rows = Math.max(6, Math.round(panelsH / m.lineH));
    const targetW = Math.ceil(cols * m.charW);
    const targetH = CHROME_H + rows * m.lineH;
    if (Math.abs(targetW - lw) > 0.5 || Math.abs(targetH - lh) > 0.5) {
      await win.setSize(new LogicalSize(targetW, targetH));
    }
    localStorage.setItem("lincom.win", JSON.stringify({ w: targetW, h: targetH }));
  } catch {
    /* никогда не роняем приложение из-за снапа */
  } finally {
    snapping = false;
  }
}

function savedWinSize(): { w: number; h: number } | null {
  try {
    const raw = localStorage.getItem("lincom.win");
    if (!raw) return null;
    const o = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof o.w === "number" && typeof o.h === "number") return { w: o.w, h: o.h };
  } catch {
    /* ignore */
  }
  return null;
}

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight",
  "ShiftLeft", "ShiftRight",
  "AltLeft", "AltRight",
  "MetaLeft", "MetaRight",
]);

document.getElementById("left")!.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("sort-title")) toggleSort("title");
  else if (target.classList.contains("sort-mtime")) toggleSort("updatedAt");
});

//! Кнопки окна: останавливаем mousedown, чтобы drag-зона тайтлбара не поглотила клик.
document.getElementById("win-controls")?.addEventListener("mousedown", (e) => {
  e.stopPropagation();
});

document.addEventListener("keydown", (e) => {
  if (state.input) return;
  if (MODIFIER_CODES.has(e.code)) return;

  if (state.search.active) {
    if (e.ctrlKey && !e.shiftKey && e.code === "KeyS") { e.preventDefault(); closeSearch(); }
    return;
  }

  if (state.confirm) {
    e.preventDefault();
    if (e.key === "Enter") {
      if (state.confirm.pendingInput.toLowerCase() === "y") {
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
    } else if (e.key === "Escape") {
      state.confirm = null;
      redraw();
    } else if (e.key.length === 1) {
      state.confirm.pendingInput += e.key;
      redraw();
    }
    return;
  }

  if (state.reorder.active) {
    e.preventDefault();
    if (e.code === "ArrowLeft") {
      state.reorder.cursor = Math.max(1, state.reorder.cursor - 1);
      redraw();
    } else if (e.code === "ArrowRight") {
      state.reorder.cursor = Math.min(state.data.folders.length - 1, state.reorder.cursor + 1);
      redraw();
    } else if (e.code === "ArrowUp") {
      move(-1);
    } else if (e.code === "ArrowDown") {
      move(1);
    } else if (e.key === "Enter") {
      toggleReorder();
    } else if (e.key === "Escape") {
      state.reorder.active = false;
      redraw();
    }
    return;
  }

  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  const ctrlShift = ctrl && e.shiftKey;
  const ctrlOnly = ctrl && !e.shiftKey;

  if (e.code === "Space") {
    e.preventDefault();
    state.spaceHeld = true;
    const l = visibleLinks()[state.leftCursor];
    if (state.panel === "left" && l) state.selectedLinks.add(l.id);
    redraw();
    return;
  }

  maybeClearSelection(ctrlOnly && e.code === "KeyC");
  if (ctrl && (e.code === "Equal" || e.code === "NumpadAdd")) { e.preventDefault(); opacityStep(1); return; }
  if (ctrl && (e.code === "Minus" || e.code === "NumpadSubtract")) { e.preventDefault(); opacityStep(-1); return; }

  if (ctrlShift && e.code === "KeyN") { e.preventDefault(); dialogCreateFolder(); return; }
  if (ctrlShift && e.code === "KeyT") { e.preventDefault(); state.theme = toggleTheme(); redraw(); return; }
  if (ctrlShift && e.code === "KeyH") { e.preventDefault(); toggleReorder(); return; }
  if (ctrlOnly && e.code === "KeyN") { e.preventDefault(); dialogCreateLink(); return; }
  if (ctrlOnly && e.code === "KeyR") { e.preventDefault(); editCurrent(); return; }
  if (ctrlOnly && e.code === "KeyF") { e.preventDefault(); favCurrent(); return; }
  if (ctrlOnly && e.code === "KeyC") { e.preventDefault(); void copyLinks(); return; }
  if (ctrlOnly && e.code === "KeyS") { e.preventDefault(); openSearch(); return; }

  if (e.key >= "0" && e.key <= "9" && !ctrl && !e.altKey && !e.metaKey) {
    e.preventDefault();
    jumpToFolder(parseInt(e.key));
    return;
  }

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

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    state.spaceHeld = false;
    redraw();
  }
});

kbd.addEventListener("keydown", (e) => {
  // Не пускаем событие в основной обработчик: иначе Enter после закрытия
  // поиска/диалога успевал открыть ссылку, а цифры в поиске прыгали по папкам.
  if (state.search.active || state.input) e.stopPropagation();
  if (state.search.active) {
    handleSearchKey(e);
    return;
  }

  const inp = state.input;
  if (!inp) return;
  const len = inp.stages[inp.idx].value.length;
  const clampPos = (p: number): number => Math.max(0, Math.min(len, p));

  if (e.key === "Enter") { e.preventDefault(); void acceptStage(); return; }
  if (e.key === "Escape") { e.preventDefault(); cancelInput(); return; }
  if (e.key === "ArrowUp") { e.preventDefault(); histMove(-1); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); histMove(1); return; }

  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
    e.preventDefault();
    const [a, b] = selRange(inp);
    const hasSel = a !== b;
    if (e.shiftKey) {
      if (inp.selAnchor === null) inp.selAnchor = inp.caret;
      let next = inp.caret;
      if (e.key === "ArrowLeft") next = inp.caret - 1;
      else if (e.key === "ArrowRight") next = inp.caret + 1;
      else if (e.key === "Home") next = 0;
      else next = len;
      inp.caret = clampPos(next);
    } else {
      if (hasSel && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        inp.caret = e.key === "ArrowLeft" ? a : b;
      } else {
        let next = inp.caret;
        if (e.key === "ArrowLeft") next = inp.caret - 1;
        else if (e.key === "ArrowRight") next = inp.caret + 1;
        else if (e.key === "Home") next = 0;
        else next = len;
        inp.caret = clampPos(next);
      }
      inp.selAnchor = null;
    }
    syncKbdSelection();
    redraw();
    return;
  }

  if (e.ctrlKey && e.code === "KeyA") {
    e.preventDefault();
    inp.selAnchor = 0;
    inp.caret = len;
    syncKbdSelection();
    redraw();
    return;
  }

  if (e.ctrlKey && e.code === "KeyC") {
    e.preventDefault();
    const [a, b] = selRange(inp);
    if (a !== b) void writeText(inp.stages[inp.idx].value.slice(a, b));
    return;
  }

  syncKbdSelection();
});

kbd.addEventListener("input", () => {
  if (state.search.active) {
    const s = state.search;
    s.query = kbd.value;
    s.caret = kbd.selectionStart ?? kbd.value.length;
    s.selAnchor = null;
    computeSearchResults();
    s.resultCursor = 0;
    redraw();
    return;
  }
  const inp = state.input;
  if (!inp) return;
  resyncCaretFromKbd();
  redraw();
});

document.getElementById("btn-min")?.addEventListener("click", () => {
  void getCurrentWindow().minimize();
});
document.getElementById("btn-close")?.addEventListener("click", () => {
  void getCurrentWindow().close();
});

async function restoreWindowState(): Promise<void> {
  try {
    applyOpacity();
    const saved = savedWinSize();
    if (saved) {
      await getCurrentWindow().setSize(new LogicalSize(saved.w, saved.h));
    }
    redraw();
    scheduleSnap();
  } catch {
    /* ignore */
  }
}

async function init(): Promise<void> {
  applyTheme(state.theme);
  measure();
  await refresh();
  state.currentFolderId = zeroId();
  redraw();
  // Восстанавливаем размер/прозрачность ТОЛЬКО после первой отрисовки,
  // чтобы окно никогда не показывало пустой экран.
  window.setTimeout(() => {
    void restoreWindowState();
  }, 0);
}

window.addEventListener("resize", () => {
  redraw();
  scheduleSnap();
});
void init();
