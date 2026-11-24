// Notes: create, edit, search, tags, Obsidian-compatible Markdown export.

let currentNoteId = null; // note open in the editor, null = new note

// "#идея #work" -> ["идея", "work"]
function tagsOf(text) {
  const found = text.match(/#[\p{L}\p{N}_-]+/gu) || [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

function titleOf(text) {
  const first = text.trim().split("\n")[0];
  return first.length > 60 ? first.slice(0, 60) + "…" : first || "Без названия";
}

// ---------- list ----------

renderers.notes = function () {
  const query = $("search").value.trim().toLowerCase();
  const list = $("notes");
  list.innerHTML = "";

  const visible = S.notes
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

  $("empty").hidden = S.notes.length > 0;
  renderTags();
};

function renderTags() {
  const box = $("tags");
  box.innerHTML = "";
  const all = [...new Set(S.notes.flatMap((n) => tagsOf(n.text)))].sort();
  for (const tag of all) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = "#" + tag;
    chip.onclick = () => {
      $("search").value = "#" + tag;
      renderers.notes();
    };
    box.append(chip);
  }
}

// ---------- editor ----------

function openEditor(id) {
  currentNoteId = id;
  const note = S.notes.find((n) => n.id === id);
  $("editor").value = note ? note.text : "";
  $("delete").hidden = !note;
  openOverlay("editor");
  $("editor").focus();
}

async function saveCurrentNote() {
  const text = $("editor").value;
  if (!text.trim()) return closeOverlay();

  const now = Date.now();
  const note = S.notes.find((n) => n.id === currentNoteId);
  if (note) {
    note.text = text;
    note.updated = now;
  } else {
    S.notes.push({ id: newId(), text, created: now, updated: now });
  }
  await save("notes");
  haptic();
  closeOverlay();
}

async function deleteCurrentNote() {
  if (!(await confirmAsk("Удалить заметку?"))) return;
  S.notes = S.notes.filter((n) => n.id !== currentNoteId);
  await save("notes");
  haptic();
  closeOverlay();
}

// ---------- export (Obsidian-compatible Markdown + full JSON backup) ----------

function fileNameOf(note) {
  const safe = titleOf(note.text).replace(/[\\/:*?"<>|#…]/g, "").trim().slice(0, 50);
  return `${safe || "note"}-${note.id}.md`;
}

function workoutsMarkdown() {
  const done = S.workouts.filter((w) => w.end).sort((a, b) => a.start - b.start);
  let md = "# Журнал тренировок\n";
  for (const w of done) {
    md += `\n## ${formatDate(w.start)}\n`;
    for (const item of w.items) {
      md += `- **${item.name}**: ${item.sets.map((s) => `${s.w}×${s.r}`).join(", ")}\n`;
    }
  }
  return md;
}

async function exportZip() {
  if (!window.JSZip) return toast("Экспорт недоступен без интернета");
  const zip = new JSZip();
  for (const note of S.notes) {
    const frontmatter =
      "---\n" +
      `created: ${new Date(note.created).toISOString()}\n` +
      `updated: ${new Date(note.updated).toISOString()}\n` +
      `tags: [${tagsOf(note.text).join(", ")}]\n` +
      "---\n\n";
    zip.file(fileNameOf(note), frontmatter + note.text + "\n");
  }
  zip.file("Трекеры/Тренировки.md", workoutsMarkdown());
  const { premium, ...data } = S;
  zip.file("Трекеры/backup.json", JSON.stringify(data, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });

  // Works in a normal browser and Telegram Desktop. On phones the Telegram
  // webview may ignore this download; later the bot will send the file to the chat.
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `second-brain-${dayKey()}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- wiring (static elements) ----------

function initNotes() {
  $("search").oninput = () => renderers.notes();
  $("new-note").onclick = () => openEditor(null);
  $("save").onclick = saveCurrentNote;
  $("delete").onclick = deleteCurrentNote;
  $("back").onclick = closeOverlay;
  $("export").onclick = exportZip;
}
