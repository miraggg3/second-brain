// "Мои данные": where data lives, backup to a file, import on another device,
// Obsidian export and full wipe.

import { useRef, useState } from "preact/hooks";
import { data, replaceAll, update, wipeAll } from "../store";
import {
  backupFileName, countMetrics, makeBackup, mergeData, parseBackup, replaceData, summarize, type Backup,
} from "../backup";
import { ApiError, downloadBlob, sendFileToChat } from "../api";
import { closeOverlay } from "../nav";
import { Icon, Section, toast } from "../ui";
import { confirmAsk, hapticOk, inTelegram, isPhone } from "../telegram";
import { bytes, dayKey, formatDate, num } from "../utils";
import { tagsOf, titleOf } from "./Notes";
import { finishedWorkouts } from "../domain";

function backupBlob(): Blob {
  return new Blob([JSON.stringify(makeBackup(data.value))], { type: "application/json" });
}

function markBackedUp() {
  update("settings", (s) => ({ ...s, lastBackup: Date.now() }));
}

function chatError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message === "chat") return "Сначала открой чат с ботом и нажми /start";
    if (e.message === "too big") return "Файл слишком большой для отправки — скачай его на ПК";
    if (e.status === 0) return "Нет связи с сервером";
  }
  return "Не получилось отправить файл";
}

// Obsidian vault: one .md per note + workout journal
async function obsidianZip(): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const n of data.value.notes) {
    const safe = titleOf(n.text).replace(/[\\/:*?"<>|#…]/g, "").trim().slice(0, 50);
    const front = `---\ncreated: ${new Date(n.created).toISOString()}\nupdated: ${new Date(n.updated).toISOString()}\ntags: [${tagsOf(n.text).join(", ")}]\n---\n\n`;
    zip.file(`${safe || "note"}-${n.id}.md`, front + n.text + "\n");
  }
  let md = "# Журнал тренировок\n";
  for (const w of finishedWorkouts(data.value.workouts).reverse()) {
    md += `\n## ${formatDate(w.start)}\n`;
    for (const it of w.items) md += `- **${it.name}**: ${it.sets.map((s) => `${s.w}×${s.r}`).join(", ")}\n`;
  }
  zip.file("Трекеры/Тренировки.md", md);
  return zip.generateAsync({ type: "blob" });
}

export function DataScreen() {
  const d = data.value;
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const size = JSON.stringify(makeBackup(d)).length;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const sendBackup = () => run(async () => {
    try {
      await sendFileToChat(backupBlob(), backupFileName(), `Копия «Второго мозга» от ${formatDate(Date.now())}. Открой приложение на другом устройстве → Мои данные → Загрузить файл.`);
      markBackedUp();
      hapticOk();
      toast("Файл в чате с ботом ✓");
    } catch (e) {
      toast(chatError(e));
    }
  });

  const download = () => {
    downloadBlob(backupBlob(), backupFileName());
    markBackedUp();
  };

  const copy = () => run(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(makeBackup(data.value)));
      markBackedUp();
      toast("Скопировано. Вставь текст на другом устройстве");
    } catch {
      toast("Буфер обмена недоступен");
    }
  });

  const readText = (text: string) => {
    try {
      setPending(parseBackup(text));
      setPasteOpen(false);
      setPasted("");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast("Файл слишком большой");
    readText(await file.text());
  };

  const applyImport = (mode: "merge" | "replace") => run(async () => {
    if (!pending) return;
    if (mode === "replace" && !(await confirmAsk("Всё, что сейчас на этом устройстве, заменится содержимым файла. Продолжить?"))) return;
    const next = mode === "merge" ? mergeData(data.value, pending.data) : replaceData(data.value, pending.data);
    try {
      await replaceAll(next);
      setPending(null);
      hapticOk();
      toast(mode === "merge" ? "Данные объединены ✓" : "Данные заменены ✓");
    } catch {
      toast("Не хватило места на устройстве");
    }
  });

  const obsidian = (how: "chat" | "download") => run(async () => {
    const blob = await obsidianZip();
    const name = `second-brain-obsidian-${dayKey()}.zip`;
    if (how === "download") return downloadBlob(blob, name);
    try {
      await sendFileToChat(blob, name, "Заметки для Obsidian: распакуй архив в папку хранилища.");
      toast("Архив в чате с ботом ✓");
    } catch (e) {
      toast(chatError(e));
    }
  });

  const wipe = async () => {
    if (!(await confirmAsk("Удалить ВСЕ записи с этого устройства? Это нельзя отменить."))) return;
    if (!(await confirmAsk("Точно? Сохранил копию?"))) return;
    await wipeAll();
    toast("Всё удалено");
  };

  return (
    <>
      <header class="head">
        <div class="head-title">
          <span class="idx">⇅</span>
          <h1>Мои данные</h1>
          <p class="mono sub">{bytes(size)} на этом устройстве</p>
        </div>
        <div class="head-actions">
          <button class="corner" aria-label="Закрыть" onClick={closeOverlay}><Icon name="close" /></button>
        </div>
      </header>

      <Section num="i" label="Где хранится" class="memo">
        <p>
          <b>Только на этом устройстве.</b> На сервере ничего нет: ни заметок, ни тренировок.
          Удалишь Telegram или выйдешь из аккаунта здесь — записи пропадут вместе с ним.
        </p>
        <p>На телефоне и на ПК данные <b>свои</b>: чтобы перенести, сохрани файл и загрузи его на другом устройстве.</p>
        <div class="ledger inner">
          <div><b>{d.notes.length}</b><span>заметок</span></div>
          <div><b>{d.workouts.length}</b><span>трениров.</span></div>
          <div><b>{num(countMetrics(d.metrics) + d.habits.length, 0)}</b><span>записей</span></div>
        </div>
        <p class="mono sub">последняя копия: {d.settings.lastBackup ? formatDate(d.settings.lastBackup) : "ещё не было"}</p>
      </Section>

      <Section num="1" label="Сохранить копию">
        {inTelegram && (
          <>
            <button class="btn wide" disabled={busy} onClick={sendBackup}>
              <Icon name="send" size={18} /> Отправить файл в чат с ботом
            </button>
            <p class="hint">Файл придёт в чат с ботом — на ПК его можно скачать прямо из Telegram.</p>
          </>
        )}
        {!isPhone && (
          <button class="btn ghost wide" disabled={busy} onClick={download}><Icon name="download" size={18} /> Скачать .json</button>
        )}
        <button class="btn ghost wide" disabled={busy} onClick={copy}><Icon name="copy" size={18} /> Скопировать как текст</button>
      </Section>

      <Section num="2" label="Загрузить на это устройство">
        {pending ? (
          <div class="import-card">
            <p class="mono sub">файл от {pending.exportedAt ? formatDate(pending.exportedAt) : "неизвестной даты"}</p>
            <p><b>{summarize(pending.data)}</b></p>
            <button class="btn wide" disabled={busy} onClick={() => applyImport("merge")}>Объединить с тем, что здесь</button>
            <p class="hint">Ничего не потеряется: записи с обоих устройств сложатся, у одинаковых останется более свежая версия.</p>
            <button class="btn ghost wide danger" disabled={busy} onClick={() => applyImport("replace")}>Заменить всё содержимым файла</button>
            <button class="link" onClick={() => setPending(null)}>отмена</button>
          </div>
        ) : (
          <>
            <button class="btn wide" onClick={() => fileInput.current?.click()}><Icon name="upload" size={18} /> Выбрать файл</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} />
            <button class="btn ghost wide" onClick={() => setPasteOpen(!pasteOpen)}><Icon name="paste" size={18} /> Вставить текст</button>
            {pasteOpen && (
              <>
                <textarea class="paste" placeholder="Вставь сюда скопированную копию" value={pasted}
                  onInput={(e) => setPasted(e.currentTarget.value)} />
                <button class="btn wide" disabled={!pasted.trim()} onClick={() => readText(pasted)}>Проверить</button>
              </>
            )}
          </>
        )}
      </Section>

      <Section num="3" label="Заметки в Obsidian">
        <p class="hint">Архив .md-файлов с тегами и журналом тренировок.</p>
        <div class="row">
          {inTelegram && <button class="btn ghost" disabled={busy} onClick={() => obsidian("chat")}>В чат</button>}
          {!isPhone && <button class="btn ghost" disabled={busy} onClick={() => obsidian("download")}>Скачать .zip</button>}
        </div>
      </Section>

      <Section num="!" label="Стереть всё" class="danger-zone">
        <p class="hint">Удаляет все записи с этого устройства. Копии в чате с ботом останутся.</p>
        <button class="btn ghost wide danger" onClick={wipe}><Icon name="trash" size={18} /> Удалить все данные</button>
      </Section>
    </>
  );
}
