//! Символьный рендер интерфейса в стиле Midnight Commander.

import type { InputState, Link, SortState, State } from "./types";

let charW = 8;
let lineH = 14;

export function measure(): void {
  const probe = document.getElementById("probe")!;
  const text = probe.textContent ?? "MMMMMMMMMM";
  const w = probe.getBoundingClientRect().width / text.length;
  if (w > 0) charW = w;
  const lh = parseFloat(getComputedStyle(document.getElementById("left")!).lineHeight);
  if (!Number.isNaN(lh) && lh > 0) lineH = lh;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function trunc(s: string, n: number): string {
  if (n <= 0) return "";
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
}

function offsetFor(cursor: number, len: number, visible: number): number {
  if (len <= visible) return 0;
  let off = 0;
  if (cursor >= visible) off = cursor - visible + 1;
  if (off > len - visible) off = len - visible;
  return Math.max(0, off);
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

//! ЕДИНСТВЕННЫЙ источник порядка отображения ссылок.
export function sortLinks(links: Link[], sort: SortState | null): Link[] {
  const copy = [...links];
  copy.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (!sort) return 0;
    let cmp = 0;
    if (sort.column === "title") {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    } else {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    }
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return copy;
}

function sortSign(state: State, col: "title" | "updatedAt"): string {
  if (state.sort?.column !== col) return "";
  return state.sort.direction === "asc" ? "+" : "-";
}

function sortInd(state: State): string {
  if (!state.sort) return "[^]";
  return state.sort.direction === "asc" ? "[+]" : "[-]";
}

function headerLeft(state: State, label: string, cols: number): string {
  const prefix = "<─ ";
  const suffix = ` ${sortInd(state)}─`;
  const avail = Math.max(4, cols - prefix.length - suffix.length - 1);
  const lab = trunc(label, avail);
  const dashes = Math.max(0, cols - prefix.length - lab.length - 1 - suffix.length);
  return (
    `<span class="c-border">${prefix}</span>` +
    `<span class="blk">${esc(lab)}</span>` +
    `<span class="c-border"> ${"─".repeat(dashes)}${suffix}</span>`
  );
}

function headerRight(label: string, cols: number, reorder = false): string {
  const prefix = "─ ";
  const suffix = reorder ? " [REORDER]>" : " [^]>";
  const avail = Math.max(4, cols - prefix.length - suffix.length - 1);
  const lab = trunc(label, avail);
  const dashes = Math.max(0, cols - prefix.length - lab.length - 1 - suffix.length);
  return (
    `<span class="c-border">${prefix}</span>` +
    `<span class="blk${reorder ? " reorder" : ""}">${esc(lab)}</span>` +
    `<span class="c-border"> ${"─".repeat(dashes)}${suffix}</span>`
  );
}

function renderLeft(state: State, cols: number, rows: number): string {
  const rawLinks = state.data.links.filter((l) => l.folderId === state.currentFolderId);
  const links = sortLinks(rawLinks, state.sort);
  const folder = state.data.folders.find((f) => f.id === state.currentFolderId);
  const out: string[] = [];

  const row = (html: string, active = false, selected = false): void => {
    const cls = [active ? "inv-row" : "", selected ? "sel-row" : ""].filter(Boolean).join(" ");
    out.push(`<div class="row${cls ? " " + cls : ""}">${html}</div>`);
  };

  const label = `${folder ? folder.name : "?"} · ${links.length} link${links.length === 1 ? "" : "s"}`;
  row(headerLeft(state, label, cols));

  const titleW = Math.max(8, Math.floor(cols * 0.40));
  const urlW = Math.max(8, Math.floor(cols * 0.35));
  const mtimeW = Math.max(6, cols - titleW - urlW - 2);
  const textW = titleW - 1;

  row(
    `<span class="c-hdr sort-title">${esc(trunc(" Name" + sortSign(state, "title"), titleW).padEnd(titleW))}</span>` +
    `<span class="c-col">│</span>` +
    `<span class="c-hdr">${esc(trunc(" URL", urlW).padEnd(urlW))}</span>` +
    `<span class="c-col">│</span>` +
    `<span class="c-hdr sort-mtime">${esc(trunc(" MTime" + sortSign(state, "updatedAt"), mtimeW).padEnd(mtimeW))}</span>`,
  );

  const visible = Math.max(1, rows - 3);
  const offset = offsetFor(state.leftCursor, links.length, visible);

  for (let r = 0; r < visible; r++) {
    const i = offset + r;
    if (i < links.length) {
      const l = links[i];
      const active = state.panel === "left" && i === state.leftCursor;
      const selected = state.selectedLinks.has(l.id);
      const fav = l.isFavorite ? "*" : " ";
      const t = trunc(l.title, textW).padEnd(textW);
      const u = trunc(l.url, urlW).padEnd(urlW);
      const m = formatDateTime(l.updatedAt).padEnd(mtimeW).slice(0, mtimeW);
      row(
        `<span class="c-fav">${fav}</span>` +
        `<span class="c-link">${esc(t)}</span>` +
        `<span class="c-col">│</span>` +
        `<span class="c-url">${esc(u)}</span>` +
        `<span class="c-col">│</span>` +
        `<span class="c-mtime">${esc(m)}</span>`,
        active,
        selected,
      );
    } else {
      row(" ".repeat(cols));
    }
  }

  row(`<span class="c-border">${"─".repeat(cols)}</span>`);
  return out.join("");
}

function renderRight(state: State, cols: number): string {
  const count = state.data.folders.length;
  const reorder = state.reorder.active;
  const head = headerRight(`Folders · ${count}`, cols, reorder);

  const items = state.data.folders
    .map((f, i) => {
      const active = !reorder && state.panel === "right" && i === state.rightCursor;
      let cls = "";
      if (reorder) {
        if (i === state.reorder.cursor) cls = "reorder-active";
        else if (f.isZero) cls = "locked";
      } else if (active) {
        cls = "active";
      }
      const num = i < 10 ? ` (${i})` : "";
      const label = f.isZero ? `[◆${f.name}]${num}` : `[${f.name}]${num}`;
      return `<div class="fitem${cls ? " " + cls : ""}">${esc(label)}</div>`;
    })
    .join("");

  const bottom = `<div class="rline"><span class="c-border">${"─".repeat(cols)}</span></div>`;
  return `<div class="rline">${head}</div><div class="flist">${items}</div>${bottom}`;
}

//! Диапазон выделения [a,b) из состояния ввода.
function selRange(inp: InputState): [number, number] {
  const v = inp.stages[inp.idx].value;
  const caret = Math.max(0, Math.min(inp.caret, v.length));
  if (inp.selAnchor === null) return [caret, caret];
  const anchor = Math.max(0, Math.min(inp.selAnchor, v.length));
  return [Math.min(anchor, caret), Math.max(anchor, caret)];
}

//! Командная строка терминального вида: блок-курсор над символом,
//! выделенный диапазон — инверсией. Всё из состояния, не из браузера.
function renderCmd(state: State): string {
  if (state.input) {
    const inp = state.input;
    const st = inp.stages[inp.idx];
    const v = st.value;
    const [a, b] = selRange(inp);
    const caret = Math.max(0, Math.min(inp.caret, v.length));

    let body: string;
    if (a !== b) {
      body =
        esc(v.slice(0, a)) +
        `<span class="inv">${esc(v.slice(a, b))}</span>` +
        esc(v.slice(b));
    } else {
      const ch = v[caret] ?? " ";
      body =
        esc(v.slice(0, caret)) +
        `<span class="cursor">${esc(ch)}</span>` +
        esc(v.slice(caret + 1));
    }
    return (
      `<span class="c-prompt">(${esc(st.prompt)}): </span>` +
      `<span class="c-value">${body}</span>`
    );
  }
  if (state.confirm) {
    return (
      `<span class="c-warn">${esc(state.confirm.message)} (y/N): </span>` +
      `<span class="c-value">${esc(state.confirm.pendingInput)}</span>` +
      `<span class="cursor"> </span>`
    );
  }
  const n = state.data.links.filter((l) => l.folderId === state.currentFolderId).length;
  const sortInfo = state.sort ? ` · sort: ${state.sort.column} ${state.sort.direction}` : "";
  const selInfo = state.selectedLinks.size > 0 ? ` · ${state.selectedLinks.size} selected` : "";
  return (
    `<span class="c-dim"> ${state.data.folders.length} folders · ${n} links here${sortInfo}${selInfo}` +
    ` · theme: ${state.theme} · opacity ${state.opacityPct}% · Esc: back to Main</span>`
  );
}

//! Подсветка первого совпадения запроса в тексте (как в поисковиках).
function highlight(text: string, q: string): string {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(text);
  return (
    esc(text.slice(0, idx)) +
    `<span class="match">${esc(text.slice(idx, idx + q.length))}</span>` +
    esc(text.slice(idx + q.length))
  );
}

//! Поле поиска в тайтлбаре + выпадающий список результатов.
function renderSearch(state: State): void {
  const box = document.getElementById("searchbox")!;
  const line = document.getElementById("searchline")!;
  const drop = document.getElementById("searchdrop")!;
  const s = state.search;

  if (!s.active) {
    box.style.display = "none";
    drop.style.display = "none";
    line.innerHTML = "";
    drop.innerHTML = "";
    return;
  }
  box.style.display = "flex";

  const v = s.query;
  const caret = Math.max(0, Math.min(s.caret, v.length));
  let sa = caret;
  let sb = caret;
  if (s.selAnchor !== null) {
    const an = Math.max(0, Math.min(s.selAnchor, v.length));
    sa = Math.min(an, caret);
    sb = Math.max(an, caret);
  }
  let body: string;
  if (sa !== sb) {
    body =
      esc(v.slice(0, sa)) +
      `<span class="inv">${esc(v.slice(sa, sb))}</span>` +
      esc(v.slice(sb));
  } else {
    const ch = v[caret] ?? " ";
    body =
      esc(v.slice(0, caret)) +
      `<span class="cursor">${esc(ch)}</span>` +
      esc(v.slice(caret + 1));
  }
  line.innerHTML =
    `<span class="c-prompt">Search: </span><span class="c-value">${body}</span>`;

  const q = s.query.trim();
  if (!q) {
    drop.style.display = "none";
    drop.innerHTML = "";
    return;
  }
  drop.style.display = "block";

  if (s.results.length === 0) {
    drop.innerHTML = `<div class="srow dim">no matches</div>`;
    return;
  }

  const maxRows = 10;
  const rows = s.results.slice(0, maxRows);
  drop.innerHTML = rows
    .map((l, i) => {
      const folder = state.data.folders.find((f) => f.id === l.folderId);
      const fname = folder ? folder.name : "?";
      const active = i === s.resultCursor;
      const titleHtml = highlight(l.title, q);
      const urlHtml = l.title.toLowerCase().includes(q.toLowerCase())
        ? esc(l.url)
        : highlight(l.url, q);
      return (
        `<div class="srow${active ? " active" : ""}">` +
        `<span class="s-folder">[${esc(fname)}]</span> ` +
        `<span class="s-title">${titleHtml}</span> ` +
        `<span class="s-url">${urlHtml}</span></div>`
      );
    })
    .join("");
}

export function render(state: State): void {
  const panels = document.getElementById("panels")!;
  const leftEl = document.getElementById("left")!;
  const rightEl = document.getElementById("right")!;
  const sepEl = document.getElementById("sep") as HTMLPreElement;
  const cmdEl = document.getElementById("cmdline")!;

  const rect = panels.getBoundingClientRect();
  const totalCols = Math.max(60, Math.floor(rect.width / charW));
  const rightCols = Math.max(20, Math.min(34, Math.floor(totalCols / 3)));
  const leftCols = totalCols - rightCols - 1;
  const rows = Math.max(5, Math.floor(rect.height / lineH));
  const heightPx = rows * lineH;

  leftEl.style.width = `${leftCols}ch`;
  sepEl.style.width = `1ch`;
  rightEl.style.width = `${rightCols}ch`;
  leftEl.style.height = `${heightPx}px`;
  sepEl.style.height = `${heightPx}px`;
  rightEl.style.height = `${heightPx}px`;

  leftEl.innerHTML = renderLeft(state, leftCols, rows);
  sepEl.innerHTML = `╥\n${"║\n".repeat(Math.max(0, rows - 2))}╨\n`;
  rightEl.innerHTML = renderRight(state, rightCols);
  cmdEl.innerHTML = renderCmd(state);
  renderSearch(state);
}


//! Метрики глифов для снапа размера окна.
export function metrics(): { charW: number; lineH: number } {
  return { charW, lineH };
}
