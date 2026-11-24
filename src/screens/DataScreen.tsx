// "Перенос данных": where data lives, save a backup file (every way that works
// on this device), import on another device, Obsidian export, wipe.

import { useRef, useState } from "preact/hooks";
import { data, replaceAll, update, wipeAll } from "../store";
import {
  backupFileName, countMetrics, makeBackup, mergeData, parseBackup, replaceData, summarize, type Backup,
} from "../backup";
import {
  ApiError, canShareFiles, canTelegramDownload, downloadBlob, sendFileToChat, serverOnline, shareFile, telegramDownload,
} from "../api";
import { closeOverlay } from "../nav";
import { Card, Icon, PageHead, Row, toast } from "../ui";
import { confirmAsk, hapticOk, isPhone } from "../telegram";
import { bytes, dayKey, formatDate, num } from "../utils";
import { tagsOf, titleOf } from "./Notes";
import { finishedWorkouts } from "../domain";

const backupBlob = () => new Blob([JSON.stringify(makeBackup(data.value))], { type: "application/json" });

const markBackedUp = () => update("settings", (s) => ({ ...s, lastBackup: Date.now() }));

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message === "chat") return "Сначала открой чат с ботом и нажми «Старт»";
    if (e.message === "too big") return "Файл слишком большой";
    if (e.status === 0) return "Нет связи с сервером";
  }
  return "Не получилось, попробуй другой способ";
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

// All ways to get a file out that work on this device, best first.
function SaveOptions({ make, name, caption, onDone, busy, run }: {
  make: () => Promise<Blob> | Blob; name: string; caption: string; onDone?: () => void;
  busy: boolean; run: (fn: () => Promise<void>) => void;
}) {
  const share = canShareFiles();
  const tgDl = canTelegramDownload();
  const done = (msg: string) => { hapticOk(); onDone?.(); toast(msg); };

  return (
    <div class="card list">
      {serverOnline.value && (
        <Row icon="send" color="linear-gradient(135deg,#2AABEE,#229ED9)" title="Отправить в чат с ботом"
          sub="Файл придёт в Telegram — откроешь на любом устройстве"
          onClick={() => !busy && run(async () => {
            try { await sendFileToChat(await make(), name, caption); done("Файл в чате с ботом ✓"); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {tgDl && (
        <Row icon="download" color="linear-gradient(135deg,#10B981,#06B6D4)" title="Скачать файл"
          sub="Сохранится в «Загрузки» или «Файлы»"
          onClick={() => !busy && run(async () => {
            try { if (await telegramDownload(await make(), name)) done("Скачивание началось ✓"); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {share && (
        <Row icon="share" color="linear-gradient(135deg,#9B5CF6,#5B5BF6)" title="Поделиться файлом"
          sub="Сохранить в Файлы, отправить в Избранное, на Диск…"
          onClick={() => !busy && run(async () => {
            try { if (await shareFile(await make(), name)) done("Готово ✓"); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {!tgDl && !isPhone && (
        <Row icon="download" color="linear-gradient(135deg,#10B981,#06B6D4)" title="Скачать файл" sub="В папку загрузок"
          onClick={() => !busy && run(async () => { downloadBlob(await make(), name); done("Файл скачан ✓"); })} />
      )}
    </div>
  );
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
    try { await fn(); } finally { setBusy(false); }
  };

  const copy = () => run(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(makeBackup(data.value)));
      markBackedUp();
      hapticOk();
      toast("Скопировано — вставь на другом устройстве");
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

  const wipe = async () => {
    if (!(await confirmAsk("Удалить ВСЕ записи с этого устройства? Это нельзя отменить."))) return;
    if (!(await confirmAsk("Точно? Копия сохранена?"))) return;
    await wipeAll();
    toast("Всё удалено");
  };

  return (
    <>
      <PageHead title="Перенос данных" sub="Профиль" right={
        <button class="icon-btn round" aria-label="Закрыть" onClick={closeOverlay}><Icon name="close" size={20} /></button>} />

      <section class="info-card">
        <span class="info-ico"><Icon name="shield" size={24} /></span>
        <div>
          <b>Всё хранится только здесь</b>
          <p>На сервере нет ни заметок, ни тренировок. Удалишь Telegram — записи удалятся. Телефон и ПК — разные хранилища: переноси через файл.</p>
        </div>
      </section>

      <div class="stat-row">
        <div class="stat"><b>{d.notes.length}</b><small>заметок</small></div>
        <div class="stat"><b>{d.workouts.length}</b><small>тренировок</small></div>
        <div class="stat"><b>{num(countMetrics(d.metrics) + d.habits.length + d.trackers.length, 0)}</b><small>записей</small></div>
      </div>
      <p class="muted small center">{bytes(size)} · последняя копия: {d.settings.lastBackup ? formatDate(d.settings.lastBackup) : "ещё не было"}</p>

      <h2 class="section-title">1. Сохранить копию</h2>
      <SaveOptions make={backupBlob} name={backupFileName()} busy={busy} run={run} onDone={markBackedUp}
        caption={`Копия «Второго мозга» от ${formatDate(Date.now())}. На другом устройстве: Профиль → Перенос данных → Загрузить файл.`} />
      <div class="card list">
        <Row icon="copy" color="linear-gradient(135deg,#F59E0B,#F97316)" title="Скопировать как текст"
          sub="Работает везде, даже без интернета" onClick={copy} />
      </div>
      {!serverOnline.value && (
        <p class="footnote">Когда подключат сервер бота, здесь появятся «Отправить в чат» и «Скачать файл» для телефона.</p>
      )}

      <h2 class="section-title">2. Загрузить на это устройство</h2>
      {pending ? (
        <Card class="import">
          <p class="muted small">Файл от {pending.exportedAt ? formatDate(pending.exportedAt) : "неизвестной даты"}</p>
          <p><b>{summarize(pending.data)}</b></p>
          <button class="btn block" disabled={busy} onClick={() => applyImport("merge")}>Объединить с текущими</button>
          <p class="muted small">Ничего не потеряется: записи с обоих устройств сложатся, у одинаковых останется свежая версия.</p>
          <button class="btn block ghost danger" disabled={busy} onClick={() => applyImport("replace")}>Заменить всё</button>
          <button class="text-btn center" onClick={() => setPending(null)}>Отмена</button>
        </Card>
      ) : (
        <div class="card list">
          <Row icon="upload" color="linear-gradient(135deg,#5B5BF6,#9B5CF6)" title="Выбрать файл" sub=".json из чата, «Файлов» или загрузок"
            onClick={() => fileInput.current?.click()} />
          <Row icon="copy" color="linear-gradient(135deg,#F59E0B,#F97316)" title="Вставить текст" sub="Если копировал как текст"
            onClick={() => setPasteOpen(!pasteOpen)} />
          <input ref={fileInput} type="file" accept=".json,application/json,text/plain" hidden onChange={onFile} />
        </div>
      )}
      {pasteOpen && !pending && (
        <Card>
          <textarea class="paste" placeholder="Вставь сюда скопированный текст" value={pasted}
            onInput={(e) => setPasted(e.currentTarget.value)} />
          <button class="btn block" disabled={!pasted.trim()} onClick={() => readText(pasted)}>Проверить</button>
        </Card>
      )}

      <h2 class="section-title">3. Заметки в Obsidian</h2>
      <SaveOptions make={obsidianZip} name={`second-brain-obsidian-${dayKey()}.zip`} busy={busy} run={run}
        caption="Заметки для Obsidian: распакуй архив в папку хранилища." />

      <h2 class="section-title">Опасная зона</h2>
      <div class="card list">
        <Row icon="trash" title="Удалить все данные" sub="С этого устройства, без возврата" danger onClick={wipe} right={<span />} />
      </div>
    </>
  );
}
