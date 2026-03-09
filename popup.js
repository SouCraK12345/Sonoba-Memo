// その場メモ — popup.js
// chrome.storage.sync で保存。ない環境（デモ）は localStorage fallback。

const storage = {
  get: (key) =>
    typeof chrome !== "undefined" && chrome.storage
      ? new Promise((r) => chrome.storage.sync.get(key, r))
      : Promise.resolve({ [key]: JSON.parse(localStorage.getItem(key) || "null") }),
  set: (obj) =>
    typeof chrome !== "undefined" && chrome.storage
      ? new Promise((r) => chrome.storage.sync.set(obj, r))
      : Promise.resolve(localStorage.setItem(Object.keys(obj)[0], JSON.stringify(Object.values(obj)[0]))),
};

const NOTES_KEY = "memo_notes";
const MAX_NOTES = 20;

async function loadNotes() {
  const result = await storage.get(NOTES_KEY);
  return result[NOTES_KEY] || [];
}

async function saveNotes(notes) {
  await storage.set({ [NOTES_KEY]: notes });
}

function formatDate(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function renderInlineMarkdown(text) {
  let html = text;

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return label;
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  return html;
}

function renderMarkdown(text) {
  const codeBlocks = [];
  const codeBlockTokenized = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({
      lang: escapeHtml(lang || ""),
      code: escapeHtml((code || "").replace(/\n$/, "")),
    });
    return `__CODEBLOCK_${id}__`;
  });

  const escaped = escapeHtml(codeBlockTokenized);
  const lines = escaped.split("\n");
  const parts = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      parts.push(listType === "ul" ? "</ul>" : "</ol>");
      listType = null;
    }
  };

  lines.forEach((line) => {
    const codeBlockMatch = line.trim().match(/^__CODEBLOCK_(\d+)__$/);
    if (codeBlockMatch) {
      closeList();
      const block = codeBlocks[Number(codeBlockMatch[1])];
      const langClass = block.lang ? ` class="language-${block.lang}"` : "";
      parts.push(`<pre><code${langClass}>${block.code}</code></pre>`);
      return;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") {
        closeList();
        parts.push("<ul>");
        listType = "ul";
      }
      parts.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      return;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") {
        closeList();
        parts.push("<ol>");
        listType = "ol";
      }
      parts.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      return;
    }

    closeList();
    if (line.trim() === "") {
      parts.push("<br>");
      return;
    }

    parts.push(`<div class="md-line">${renderInlineMarkdown(line)}</div>`);
  });

  closeList();
  return parts.join("");
}

function renderNotes(notes) {
  const list = document.getElementById("notesList");
  const count = document.getElementById("count");
  count.textContent = notes.length > 0 ? `${notes.length}件` : "";

  if (notes.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = notes
    .slice().reverse()
    .map((note) => `
      <div class="note-item" data-id="${note.id}">
        <div class="note-text">${renderMarkdown(note.text)}</div>
        <div class="note-meta">${formatDate(note.createdAt)}</div>
        <button class="delete-btn" data-id="${note.id}" title="削除">×</button>
      </div>
    `)
    .join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      const currentNotes = await loadNotes();
      await saveNotes(currentNotes.filter((n) => String(n.id) !== id));
      renderNotes(await loadNotes());
    });
  });
}

async function addNote(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const notes = await loadNotes();
  if (notes.length >= MAX_NOTES) notes.shift();
  notes.push({ id: Date.now(), text: trimmed, createdAt: Date.now() });
  await saveNotes(notes);
  return await loadNotes();
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("noteInput");
  const saveBtn = document.getElementById("saveBtn");

  renderNotes(await loadNotes());

  saveBtn.addEventListener("click", async () => {
    const notes = await addNote(input.value);
    if (notes) {
      input.value = "";
      renderNotes(notes);
      input.focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveBtn.click();
  });

  input.focus();
});
