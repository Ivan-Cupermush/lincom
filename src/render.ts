//! Символьный рендер интерфейса в стиле Midnight Commander.

import type { State } from "./types";

let charW = 8;
let lineH = 20;

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

function renderLeft(state: State, cols: number, rows: number): string {
  const links = state.data.links.filter((l) => l.folderId === state.currentFolderId);
  const folder = state.data.folders.find((f) => f.id === state.currentFolderId);
  const inner = cols - 2;
  const out: string[] = [];

  let head = ` ${folder ? folder.name : "?"} · ${links.length} link${links.length === 1 ? "" : "s"} `;
  head = trunc(head, inner);
  out.push(
    `<span class="c-border">┌</span><span class="c-hdr">${esc(head)}</span>` +
    `<span class="c-border">${"─".repeat(Math.max(0, inner - head.length))}┐</span>`,
  );

  const visible = Math.max(1, rows - 2);
  const offset = offsetFor(state.leftCursor, links.length, visible);
  const titleW = Math.max(10, Math.floor(inner * 0.4));
  const urlW = inner - titleW;

  for (let r = 0; r < visible; r++) {
    const i = offset + r;
    if (i < links.length) {
      const l = links[i];
      const active = state.panel === "left" && i === state.leftCursor;
      const t = trunc(l.title, titleW).padEnd(titleW);
      const u = trunc(l.url, urlW);
      const pad = " ".repeat(Math.max(0, inner - t.length - u.length));
      const content =
        `<span class="c-link">${esc(t)}</span>` +
        `<span class="c-url">${esc(u)}</span>${pad}`;
      out.push(
        `<span class="c-border">│</span>` +
        (active ? `<span class="inv">${content}</span>` : content) +
        `<span class="c-border">│</span>`,
      );
    } else {
      out.push(
        `<span class="c-border">│</span>${" ".repeat(inner)}<span class="c-border">│</span>`,
      );
    }
  }
  out.push(`<span class="c-border">└${"─".repeat(inner)}┘</span>`);
  return out.join("\n");
}

function renderRight(state: State, cols: number): string {
  const inner = cols - 2;
  return state.data.folders
    .map((f, i) => {
      const active = state.panel === "right" && i === state.rightCursor;
      const label = f.isZero ? `[ ◆ ${f.name} ]` : `[ ${f.name} ]`;
      const top = `┌${"─".repeat(inner)}┐`;
      const bot = `└${"─".repeat(inner)}┘`;
      return (
        `<div class="fwin${active ? " fwin-active" : ""}">` +
        `<div class="c-border f-line">${top}</div>` +
        `<div class="f-mid"><span class="c-border">│</span>` +
        `<span class="f-name">${esc(label)}</span>` +
        `<span class="c-border">│</span></div>` +
        `<div class="c-border f-line">${bot}</div>` +
        `</div>`
      );
    })
    .join("");
}

function renderCmd(state: State): string {
  if (state.input) {
    const st = state.input.stages[state.input.idx];
    return (
      `<span class="c-prompt">(${esc(st.prompt)}): </span>` +
      `<span class="c-value">${esc(st.value)}</span><span class="cursor"> </span>`
    );
  }
  if (state.confirm) {
    return `<span class="c-warn">${esc(state.confirm.message)} (y/N): </span><span class="cursor"> </span>`;
  }
  const n = state.data.links.filter((l) => l.folderId === state.currentFolderId).length;
  return (
    `<span class="c-dim"> ${state.data.folders.length} folders · ${n} links here` +
    ` · theme: ${state.theme} · Esc: back to Zero · lincom v0.2.0</span>`
  );
}

export function render(state: State): void {
  const panels = document.getElementById("panels")!;
  const leftEl = document.getElementById("left") as HTMLPreElement;
  const rightEl = document.getElementById("right")!;
  const cmdEl = document.getElementById("cmdline")!;

  const rect = panels.getBoundingClientRect();
  const totalCols = Math.max(40, Math.floor(rect.width / charW));
  const rightCols = Math.max(22, Math.min(38, Math.floor(totalCols / 3)));
  const leftCols = totalCols - rightCols;
  const rows = Math.max(6, Math.floor(rect.height / lineH));

  leftEl.style.width = `${leftCols}ch`;
  rightEl.style.width = `${rightCols}ch`;

  leftEl.innerHTML = renderLeft(state, leftCols, rows);
  rightEl.innerHTML = renderRight(state, rightCols);
  cmdEl.innerHTML = renderCmd(state);
}
