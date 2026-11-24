// "Заметки": index cards with #tags, search, editor.

import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { data, update } from "../store";
import { closeOverlay, openOverlay } from "../nav";
import { formatDate, newId } from "../utils";
import { Empty, Icon } from "../ui";
import { confirmAsk, haptic } from "../telegram";
import { Header } from "./Header";

const query = signal("");

// "#идея #work" -> ["идея", "work"]
export function tagsOf(text: string): string[] {
  const found = text.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

export function titleOf(text: string): string {
  const first = text.trim().split("\n")[0];
  return first.length > 60 ? first.slice(0, 60) + "…" : first || "Без названия";
}

function previewOf(text: string): string {
  const rest = text.trim().split("\n").slice(1).join(" ").trim();
  return rest.length > 90 ? rest.slice(0, 90) + "…" : rest;
}

export function Notes() {
  const notes = data.value.notes;
  const q = query.value.trim().toLowerCase();
  const visible = notes
    .filter((n) => {
      if (!q) return true;
      if (q.startsWith("#")) return tagsOf(n.text).includes(q.slice(1));
      return n.text.toLowerCase().includes(q);
    })
    .sort((a, b) => b.updated - a.updated);
  const tags = [...new Set(notes.flatMap((n) => tagsOf(n.text)))].sort();

  return (
    <>
      <Header idx="03" title="Заметки" sub={`${notes.length} в архиве`} />
      <input class="search" type="search" placeholder="Поиск или #тег" value={query.value}
        onInput={(e) => (query.value = e.currentTarget.value)} />
      {tags.length > 0 && (
        <div class="tags">
          {tags.map((t) => (
            <button key={t} class={`tag ${q === "#" + t ? "on" : ""}`}
              onClick={() => (query.value = q === "#" + t ? "" : "#" + t)}>#{t}</button>
          ))}
        </div>
      )}
      <div class="cards">
        {visible.map((n) => (
          <button key={n.id} class="index-card" onClick={() => openOverlay({ name: "editor", id: n.id })}>
            <span class="mono date">{formatDate(n.updated, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <b>{titleOf(n.text)}</b>
            {previewOf(n.text) && <span class="sub">{previewOf(n.text)}</span>}
          </button>
        ))}
      </div>
      {!notes.length && <Empty>Пусто. Нажми «+» и запиши первую мысль. Теги ставь через #, например #идея.</Empty>}
      {notes.length > 0 && !visible.length && <Empty>Ничего не нашлось.</Empty>}
      <button class="fab" aria-label="Новая заметка" onClick={() => openOverlay({ name: "editor", id: null })}>
        <Icon name="plus" size={28} />
      </button>
    </>
  );
}

// Saves on "Готово" and also when leaving with the back button.
export const editorText = { current: "" };

export function saveEditor(id: string | null) {
  const text = editorText.current;
  if (!text.trim()) return;
  const now = Date.now();
  update("notes", (ns) => {
    const old = id ? ns.find((n) => n.id === id) : undefined;
    if (old) return old.text === text ? ns : ns.map((n) => (n.id === id ? { ...n, text, updated: now } : n));
    return [...ns, { id: newId(), text, created: now, updated: now }];
  });
}

export function NoteEditor({ id }: { id: string | null }) {
  const note = id ? data.value.notes.find((n) => n.id === id) : undefined;
  const [text, setText] = useState(note?.text ?? "");
  const area = useRef<HTMLTextAreaElement>(null);
  editorText.current = text;
  useEffect(() => area.current?.focus(), []);

  // a new note gets an id on first save so "back" does not create duplicates
  const done = () => {
    saveEditor(id);
    haptic();
    closeOverlay();
  };

  const remove = async () => {
    if (!(await confirmAsk("Удалить заметку?"))) return;
    editorText.current = "";
    update("notes", (ns) => ns.filter((n) => n.id !== id));
    closeOverlay();
  };

  return (
    <div class="editor">
      <div class="editor-bar">
        <span class="mono sub">{note ? `изм. ${formatDate(note.updated)}` : "новая запись"}</span>
        <span class="mono sub">{tagsOf(text).map((t) => "#" + t).join(" ")}</span>
      </div>
      <textarea ref={area} class="paper-text" value={text} placeholder="Пиши мысль. Теги через #, например #идея"
        onInput={(e) => setText(e.currentTarget.value)} />
      <div class="row dock">
        <button class="btn" onClick={done}>Готово</button>
        {note && <button class="btn ghost danger" onClick={remove}><Icon name="trash" size={18} /></button>}
      </div>
    </div>
  );
}
