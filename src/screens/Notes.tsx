// "Заметки": search, tag filter, cards, editor.

import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { data, update } from "../store";
import { closeOverlay, openOverlay } from "../nav";
import { formatDate, newId, num, plural } from "../utils";
import { Empty, Icon, PageHead } from "../ui";
import { confirmAsk, haptic } from "../telegram";

const query = signal("");

// "#идея #work" -> ["идея", "work"]
export function tagsOf(text: string): string[] {
  const found = text.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

export function titleOf(text: string): string {
  const first = text.trim().split("\n")[0] ?? "";
  return first.length > 60 ? first.slice(0, 60) + "…" : first || "Без названия";
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
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return formatDate(ms, { day: "numeric", month: "short" });
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
      <PageHead title="Заметки" sub={`${num(notes.length, 0)} ${plural(notes.length, "запись", "записи", "записей")}`} />
      <div class="search-box big">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Поиск по заметкам" value={query.value}
          onInput={(e) => (query.value = e.currentTarget.value)} />
      </div>
      {tags.length > 0 && (
        <div class="chips scroll">
          <button class={`chip ${!q ? "on" : ""}`} onClick={() => (query.value = "")}>Все</button>
          {tags.map((t) => (
            <button key={t} class={`chip tag ${q === "#" + t ? "on" : ""}`} style={{ "--h": tagHue(t) }}
              onClick={() => (query.value = q === "#" + t ? "" : "#" + t)}>#{t}</button>
          ))}
        </div>
      )}
      <div class="note-list">
        {visible.map((n) => {
          const nt = tagsOf(n.text);
          return (
            <button key={n.id} class="note card" onClick={() => openOverlay({ name: "editor", id: n.id })}>
              <b>{titleOf(n.text)}</b>
              {previewOf(n.text) && <p>{previewOf(n.text)}</p>}
              <span class="note-foot">
                {nt.slice(0, 3).map((t) => <span key={t} class="tag-dot" style={{ "--h": tagHue(t) }}>#{t}</span>)}
                <small>{relTime(n.updated)}</small>
              </span>
            </button>
          );
        })}
      </div>
      {!notes.length && <Empty icon="notes">Здесь будут твои мысли, идеи и списки. Нажми «+», чтобы записать первую. Теги ставь через #.</Empty>}
      {notes.length > 0 && !visible.length && <Empty icon="search">Ничего не нашлось</Empty>}
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

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div class="editor">
      <div class="editor-top">
        <button class="icon-btn" aria-label="Назад" onClick={done}><Icon name="chevron" size={22} /></button>
        <span class="muted small">{note ? `Изменено ${relTime(note.updated)}` : "Новая заметка"} · {words} {plural(words, "слово", "слова", "слов")}</span>
        {note
          ? <button class="icon-btn danger" aria-label="Удалить" onClick={remove}><Icon name="trash" size={20} /></button>
          : <span style={{ width: 40 }} />}
      </div>
      <textarea ref={area} class="editor-text" value={text} placeholder={"Заголовок\n\nПиши мысль. Теги через #, например #идея"}
        onInput={(e) => setText(e.currentTarget.value)} />
      <button class="btn block dock" onClick={done}><Icon name="check" size={18} /> Готово</button>
    </div>
  );
}
