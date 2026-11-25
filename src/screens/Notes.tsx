// "Заметки": folders, search, tags, notes you can hold (menu) and drag
// (reorder, or drop onto a folder), editor.

import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { createPortal } from "preact/compat";
import { data, update } from "../store";
import type { Folder, Note } from "../types";
import { closeOverlay, openOverlay } from "../nav";
import { formatDate, newId, num } from "../utils";
import { t } from "../i18n";
import { ask, Empty, Icon, PageHead, toast } from "../ui";
import { confirmAsk, haptic, hapticOk } from "../telegram";
import { useHold, type MenuItem } from "../gestures";
import { copyText, shareImageItem, shareText } from "../share";

const query = signal("");
// selected folder: null = all notes
export const currentFolder = signal<string | null>(null);

// "#идея #work" -> ["идея", "work"]
export function tagsOf(text: string): string[] {
  const found = text.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

export function titleOf(text: string): string {
  const first = text.trim().split("\n")[0] ?? "";
  return first.length > 60 ? first.slice(0, 60) + "…" : first || t("notes.untitled");
}

function previewOf(text: string): string {
  const rest = text.trim().split("\n").slice(1).join(" ").replace(/#[\p{L}\p{N}_-]+/gu, "").trim();
  return rest.length > 110 ? rest.slice(0, 110) + "…" : rest;
}

// tag -> stable hue so each tag keeps its color
function tagHue(tag: string): number {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return t("notes.justNow");
  if (diff < 3_600_000) return t("notes.minAgo", { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("notes.hoursAgo", { n: Math.floor(diff / 3_600_000) });
  return formatDate(ms, { day: "numeric", month: "short" });
}

// ---------- order ----------

// manual position if the note was ever moved, otherwise newest first
const sortKey = (n: Note) => n.order ?? -n.updated;
const byOrder = (a: Note, b: Note) => sortKey(a) - sortKey(b);

function visibleNotes(): Note[] {
  const q = query.value.trim().toLowerCase();
  const folder = currentFolder.value;
  return data.value.notes
    .filter((n) => !folder || n.folder === folder)
    .filter((n) => {
      if (!q) return true;
      if (q.startsWith("#")) return tagsOf(n.text).includes(q.slice(1));
      return n.text.toLowerCase().includes(q);
    })
    .sort(byOrder);
}

// Puts the dragged note next to `overId` in the list as it is shown now.
function reorderNote(dragId: string, overId: string, after: boolean) {
  const list = visibleNotes().filter((n) => n.id !== dragId);
  const i = list.findIndex((n) => n.id === overId);
  if (i < 0) return;
  const at = after ? i + 1 : i;
  const prev = list[at - 1];
  const next = list[at];
  let key: number;
  if (prev && next) key = (sortKey(prev) + sortKey(next)) / 2;
  else if (prev) key = sortKey(prev) + 1;
  else if (next) key = sortKey(next) - 1;
  else return;
  update("notes", (ns) => {
    // keys too close after many moves: renumber the shown list
    if (prev && next && Math.abs(sortKey(next) - sortKey(prev)) < 1e-6) {
      const ids = [...list.slice(0, at).map((n) => n.id), dragId, ...list.slice(at).map((n) => n.id)];
      return ns.map((n) => (ids.includes(n.id) ? { ...n, order: ids.indexOf(n.id) } : n));
    }
    return ns.map((n) => (n.id === dragId ? { ...n, order: key } : n));
  });
}

function moveToFolder(noteId: string, folderId: string | null) {
  update("notes", (ns) => ns.map((n) => {
    if (n.id !== noteId) return n;
    const { folder: _old, ...rest } = n;
    return folderId ? { ...rest, folder: folderId } : rest;
  }));
  const f = data.value.folders.find((x) => x.id === folderId);
  hapticOk();
  toast(f ? t("notes.movedTo", { name: f.name }) : t("notes.removedFromFolder"));
}

// ---------- folders ----------

async function newFolder(): Promise<string | null> {
  const v = await ask({
    title: t("notes.newFolder"),
    fields: [{ name: "name", label: t("common.name"), placeholder: t("notes.folderPlaceholder") }],
    ok: t("common.create"),
  });
  const name = v?.name.trim().slice(0, 40);
  if (!name) return null;
  const f: Folder = { id: newId(), name, created: Date.now() };
  update("folders", (fs) => [...fs, f]);
  return f.id;
}

async function renameFolder(f: Folder) {
  const v = await ask({ title: t("notes.renameFolder"), fields: [{ name: "name", label: t("common.name"), value: f.name }] });
  const name = v?.name.trim().slice(0, 40);
  if (name) update("folders", (fs) => fs.map((x) => (x.id === f.id ? { ...x, name } : x)));
}

async function deleteFolder(f: Folder) {
  const count = data.value.notes.filter((n) => n.folder === f.id).length;
  const msg = count
    ? t("notes.deleteFolderKeep", { name: f.name, n: count })
    : t("notes.deleteFolderAsk", { name: f.name });
  if (!(await confirmAsk(msg))) return;
  update("notes", (ns) => ns.map((n) => {
    if (n.folder !== f.id) return n;
    const { folder: _f, ...rest } = n;
    return rest;
  }));
  update("folders", (fs) => fs.filter((x) => x.id !== f.id));
  if (currentFolder.value === f.id) currentFolder.value = null;
}

function folderText(f: Folder): string {
  const notes = data.value.notes.filter((n) => n.folder === f.id).sort(byOrder);
  return `📁 ${f.name}\n\n${notes.map((n) => n.text.trim()).join("\n\n— — —\n\n")}`;
}

function FolderTile({ folder, count }: { folder: Folder | null; count: number }) {
  const id = folder?.id ?? null;
  const on = currentFolder.value === id;
  const ref = useHold<HTMLButtonElement>({
    menu: folder ? () => [
      shareImageItem(`folder:${folder.id}`),
      { label: t("notes.shareText"), icon: "share", run: () => shareText(folderText(folder)) },
      { label: t("notes.copyAll"), icon: "copy", run: () => copyText(folderText(folder)) },
      { label: t("notes.rename"), icon: "edit", run: () => renameFolder(folder) },
      { label: t("notes.deleteFolder"), icon: "trash", danger: true, run: () => deleteFolder(folder) },
    ] : undefined,
  });
  return (
    <button ref={ref} class={`folder ${on ? "on" : ""}`} data-drop={`folder:${id ?? ""}`}
      onClick={() => { haptic(); currentFolder.value = id; }}>
      <span class="folder-ico"><Icon name={folder ? "folder" : "notes"} size={20} /></span>
      <b>{folder?.name ?? t("notes.all")}</b>
      <small>{num(count, 0)}</small>
    </button>
  );
}

// ---------- notes ----------

function moveMenu(note: Note): MenuItem[] {
  const items: MenuItem[] = data.value.folders
    .filter((f) => f.id !== note.folder)
    .map((f) => ({ label: f.name, icon: "folder", run: () => moveToFolder(note.id, f.id) }));
  if (note.folder) items.unshift({ label: t("notes.removeFromFolder"), icon: "notes", run: () => moveToFolder(note.id, null) });
  items.push({
    label: t("notes.newFolderItem"), icon: "plus",
    run: async () => {
      const id = await newFolder();
      if (id) moveToFolder(note.id, id);
    },
  });
  return items;
}

async function deleteNote(note: Note) {
  if (!(await confirmAsk(t("notes.deleteNoteAsk", { name: titleOf(note.text) })))) return;
  update("notes", (ns) => ns.filter((n) => n.id !== note.id));
}

function NoteRow({ note }: { note: Note }) {
  const tags = tagsOf(note.text);
  const folder = !currentFolder.value && note.folder ? data.value.folders.find((f) => f.id === note.folder) : undefined;
  const ref = useHold<HTMLButtonElement>({
    menu: () => [
      { label: t("common.copy"), icon: "copy", run: () => copyText(note.text) },
      { label: t("notes.shareText"), icon: "share", run: () => shareText(note.text) },
      shareImageItem(`note:${note.id}`),
      { label: note.folder ? t("notes.moveToFolder") : t("notes.toFolder"), icon: "folder", submenu: () => moveMenu(note) },
      { label: t("common.delete"), icon: "trash", danger: true, run: () => deleteNote(note) },
    ],
    sort: {
      group: "notes",
      id: note.id,
      onReorder: reorderNote,
      onDrop: (dragId, target) => {
        const folderId = target.replace(/^folder:/, "") || null;
        const n = data.value.notes.find((x) => x.id === dragId);
        if (n && (n.folder ?? null) !== folderId) moveToFolder(dragId, folderId);
      },
    },
  });
  return (
    <button ref={ref} class="note card" onClick={() => openOverlay({ name: "editor", id: note.id })}>
      <b>{titleOf(note.text)}</b>
      {previewOf(note.text) && <p>{previewOf(note.text)}</p>}
      <span class="note-foot">
        {folder && <span class="note-folder"><Icon name="folder" size={13} />{folder.name}</span>}
        {tags.slice(0, 3).map((t) => <span key={t} class="tag-dot" style={{ "--h": tagHue(t) }}>#{t}</span>)}
        <small>{relTime(note.updated)}</small>
      </span>
    </button>
  );
}

export function Notes() {
  const { notes, folders } = data.value;
  const q = query.value.trim().toLowerCase();
  const visible = visibleNotes();
  const tags = [...new Set(notes.flatMap((n) => tagsOf(n.text)))].sort();
  const folder = folders.find((f) => f.id === currentFolder.value) ?? null;
  // the open folder was deleted (e.g. by an import): back to all notes
  useEffect(() => {
    if (currentFolder.value && !folder) currentFolder.value = null;
  });

  return (
    <>
      <PageHead title={folder?.name ?? t("notes.title")}
        sub={t("notes.count", { n: visible.length })} />
      <div class="search-box big">
        <Icon name="search" size={18} />
        <input type="search" placeholder={t("notes.search")} value={query.value}
          onInput={(e) => (query.value = e.currentTarget.value)} />
      </div>

      <div class="folders">
        <FolderTile folder={null} count={notes.length} />
        {folders.map((f) => <FolderTile key={f.id} folder={f} count={notes.filter((n) => n.folder === f.id).length} />)}
        <button class="folder add" onClick={async () => { const id = await newFolder(); if (id) currentFolder.value = id; }}>
          <span class="folder-ico"><Icon name="plus" size={20} /></span>
          <b>{t("notes.folder")}</b>
          <small>{t("notes.folderNew")}</small>
        </button>
      </div>

      {tags.length > 0 && (
        <div class="chips scroll">
          {tags.map((t) => (
            <button key={t} class={`chip tag ${q === "#" + t ? "on" : ""}`} style={{ "--h": tagHue(t) }}
              onClick={() => (query.value = q === "#" + t ? "" : "#" + t)}>#{t}</button>
          ))}
        </div>
      )}

      <div class="note-list">
        {visible.map((n) => <NoteRow key={n.id} note={n} />)}
      </div>
      {!notes.length && <Empty icon="notes">{t("notes.empty")}</Empty>}
      {notes.length > 0 && !visible.length && (
        <Empty icon={q ? "search" : "folder"}>{q ? t("notes.notFound") : t("notes.folderEmpty")}</Empty>
      )}
      {notes.length > 1 && <p class="footnote center">{t("notes.hint")}</p>}

      {/* rendered into <body>: the page's slide-in animation uses a transform,
          which would otherwise make this fixed button move with the page */}
      {createPortal(
        <button class="fab" aria-label={t("notes.newNote")} onClick={() => openOverlay({ name: "editor", id: null })}>
          <Icon name="plus" size={28} />
        </button>,
        document.body,
      )}
    </>
  );
}

// ---------- editor ----------

// Saves on "Готово" and also when leaving with the back button.
export const editorText = { current: "" };

export function saveEditor(id: string | null) {
  const text = editorText.current;
  if (!text.trim()) return;
  const now = Date.now();
  update("notes", (ns) => {
    const old = id ? ns.find((n) => n.id === id) : undefined;
    if (old) return old.text === text ? ns : ns.map((n) => (n.id === id ? { ...n, text, updated: now } : n));
    // a new note goes on top of the list, into the folder that is open
    const top = ns.length ? Math.min(...ns.map(sortKey)) - 1 : 0;
    const note: Note = { id: newId(), text, created: now, updated: now, order: top };
    if (currentFolder.value) note.folder = currentFolder.value;
    return [...ns, note];
  });
}

export function NoteEditor({ id }: { id: string | null }) {
  const note = id ? data.value.notes.find((n) => n.id === id) : undefined;
  const [text, setText] = useState(note?.text ?? "");
  const area = useRef<HTMLTextAreaElement>(null);
  editorText.current = text;
  useEffect(() => area.current?.focus(), []);

  const done = () => {
    saveEditor(id);
    haptic();
    closeOverlay();
  };

  const remove = async () => {
    if (!(await confirmAsk(t("notes.deleteNote")))) return;
    editorText.current = "";
    update("notes", (ns) => ns.filter((n) => n.id !== id));
    closeOverlay();
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div class="editor">
      <div class="editor-top">
        <button class="icon-btn" aria-label={t("common.back")} onClick={done}><Icon name="chevron" size={22} /></button>
        <span class="muted small">{note ? t("notes.edited", { time: relTime(note.updated) }) : t("notes.newNote")} · {t("notes.words", { n: words })}</span>
        <span class="row-actions">
          {text.trim() && <button class="icon-btn" aria-label={t("common.copy")} onClick={() => copyText(text)}><Icon name="copy" size={20} /></button>}
          {text.trim() && <button class="icon-btn" aria-label={t("common.share")} onClick={() => shareText(text)}><Icon name="share" size={20} /></button>}
          {note && <button class="icon-btn danger" aria-label={t("common.delete")} onClick={remove}><Icon name="trash" size={20} /></button>}
        </span>
      </div>
      <textarea ref={area} class="editor-text" value={text} placeholder={t("notes.editorPlaceholder")}
        onInput={(e) => setText(e.currentTarget.value)} />
      <button class="btn block dock" onClick={done}><Icon name="check" size={18} /> {t("common.done")}</button>
    </div>
  );
}
