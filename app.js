// Second brain - MVP: create, edit, search notes, tags, Markdown export.

const tg = window.Telegram ? window.Telegram.WebApp : null;

let notes = [];          // [{ id, text, created, updated }]
let currentId = null;    // note open in the editor, null = new note

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// "#идея #work" -> ["идея", "work"]
function tagsOf(text) {
  const found = text.match(/#[\p{L}\p{N}_-]+/gu) || [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

function titleOf(text) {
  const first = text.trim().split("\n")[0];
  return first.length > 60 ? first.slice(0, 60) + "…" : first || "Без названия";
}

function formatDate(ms) {
  return new Date(ms).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function haptic() {
  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}

// ---------- list screen ----------

function renderList() {
  const query = $("search").value.trim().toLowerCase();
  const list = $("notes");
  list.innerHTML = "";

  const visible = notes
    .filter((n) => {
      if (!query) return true;
      if (query.startsWith("#")) return tagsOf(n.text).includes(query.slice(1));
      return n.text.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updated - a.updated);

  for (const note of visible) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = titleOf(note.text);
    const meta = document.createElement("small");
    meta.textContent = formatDate(note.updated);
    li.append(title, meta);
    li.onclick = () => openEditor(note.id);
    list.append(li);
  }

  $("empty").hidden = notes.length > 0;
  renderTags();
}

function renderTags() {
  const box = $("tags");
  box.innerHTML = "";
  const all = [...new Set(notes.flatMap((n) => tagsOf(n.text)))].sort();
  for (const tag of all) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = "#" + tag;
    chip.onclick = () => {
      $("search").value = "#" + tag;
      renderList();
    };
    box.append(chip);
  }
}

// ---------- edit screen ----------

function openEditor(id) {
  currentId = id;
  const note = notes.find((n) => n.id === id);
  $("editor").value = note ? note.text : "";
  $("delete").hidden = !note;
  $("list-screen").hidden = true;
  $("edit-screen").hidden = false;
  $("editor").focus();
  if (tg) tg.BackButton.show();
}

function closeEditor() {
  $("edit-screen").hidden = true;
  $("list-screen").hidden = false;
  if (tg) tg.BackButton.hide();
  renderList();
}

async function saveCurrent() {
  const text = $("editor").value;
  if (!text.trim()) return closeEditor();

  const now = Date.now();
  const note = notes.find((n) => n.id === currentId);
  if (note) {
    note.text = text;
    note.updated = now;
  } else {
    notes.push({ id: newId(), text, created: now, updated: now });
  }
  await saveNotes(notes);
  haptic();
  closeEditor();
}

async function deleteCurrent() {
  notes = notes.filter((n) => n.id !== currentId);
  await saveNotes(notes);
  haptic();
  closeEditor();
}

// ---------- export (Obsidian-compatible Markdown) ----------

function fileNameOf(note) {
  const safe = titleOf(note.text).replace(/[\\/:*?"<>|#…]/g, "").trim().slice(0, 50);
  return `${safe || "note"}-${note.id}.md`;
}

async function exportZip() {
  const zip = new JSZip();
  for (const note of notes) {
    const frontmatter =
      "---\n" +
      `created: ${new Date(note.created).toISOString()}\n` +
      `updated: ${new Date(note.updated).toISOString()}\n` +
      `tags: [${tagsOf(note.text).join(", ")}]\n` +
      "---\n\n";
    zip.file(fileNameOf(note), frontmatter + note.text + "\n");
  }
  const blob = await zip.generateAsync({ type: "blob" });

  // Works in a normal browser and Telegram Desktop. On phones the Telegram
  // webview may ignore this download; later the bot will send the file to the chat.
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- start ----------

async function start() {
  if (tg) {
    tg.ready();
    tg.expand();
    tg.BackButton.onClick(closeEditor);
  }

  $("search").oninput = renderList;
  $("new-note").onclick = () => openEditor(null);
  $("save").onclick = saveCurrent;
  $("delete").onclick = deleteCurrent;
  $("back").onclick = closeEditor;
  $("export").onclick = exportZip;

  notes = await loadNotes();
  renderList();
}

start();
