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
import { t } from "../i18n";
import { finishedWorkouts } from "../domain";

const backupBlob = () => new Blob([JSON.stringify(makeBackup(data.value))], { type: "application/json" });

const markBackedUp = () => update("settings", (s) => ({ ...s, lastBackup: Date.now() }));

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message === "chat") return t("data.errChat");
    if (e.message === "too big") return t("data.errTooBig");
    if (e.status === 0) return t("data.errOffline");
  }
  return t("data.errGeneric");
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
  let md = `# ${t("data.obsidianJournal")}\n`;
  for (const w of finishedWorkouts(data.value.workouts).reverse()) {
    md += `\n## ${formatDate(w.start)}\n`;
    for (const it of w.items) md += `- **${it.name}**: ${it.sets.map((s) => `${s.w}×${s.r}`).join(", ")}\n`;
  }
  zip.file(t("data.obsidianFile"), md);
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
        <Row icon="send" color="linear-gradient(135deg,#2AABEE,#229ED9)" title={t("data.sendToChat")}
          sub={t("data.sendToChatSub")}
          onClick={() => !busy && run(async () => {
            try { await sendFileToChat(await make(), name, caption); done(t("data.sentToChat")); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {tgDl && (
        <Row icon="download" color="linear-gradient(135deg,#10B981,#06B6D4)" title={t("data.download")}
          sub={t("data.downloadSub")}
          onClick={() => !busy && run(async () => {
            try { if (await telegramDownload(await make(), name)) done(t("data.downloadStarted")); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {share && (
        <Row icon="share" color="linear-gradient(135deg,#9B5CF6,#5B5BF6)" title={t("data.shareFile")}
          sub={t("data.shareFileSub")}
          onClick={() => !busy && run(async () => {
            try { if (await shareFile(await make(), name)) done(t("data.doneOk")); } catch (e) { toast(errorText(e)); }
          })} />
      )}
      {!tgDl && !isPhone && (
        <Row icon="download" color="linear-gradient(135deg,#10B981,#06B6D4)" title={t("data.download")} sub={t("data.downloadPcSub")}
          onClick={() => !busy && run(async () => { downloadBlob(await make(), name); done(t("data.downloaded")); })} />
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
      toast(t("data.copiedPaste"));
    } catch {
      toast(t("data.noClipboard"));
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
    if (file.size > 20 * 1024 * 1024) return toast(t("data.errTooBig"));
    readText(await file.text());
  };

  const applyImport = (mode: "merge" | "replace") => run(async () => {
    if (!pending) return;
    if (mode === "replace" && !(await confirmAsk(t("data.replaceConfirm")))) return;
    const next = mode === "merge" ? mergeData(data.value, pending.data) : replaceData(data.value, pending.data);
    try {
      await replaceAll(next);
      setPending(null);
      hapticOk();
      toast(mode === "merge" ? t("data.merged") : t("data.replaced"));
    } catch {
      toast(t("data.noSpace"));
    }
  });

  const wipe = async () => {
    if (!(await confirmAsk(t("data.wipeConfirm")))) return;
    if (!(await confirmAsk(t("data.wipeConfirm2")))) return;
    await wipeAll();
    toast(t("data.wiped"));
  };

  return (
    <>
      <PageHead title={t("data.title")} sub={t("tab.profile")} right={
        <button class="icon-btn round" aria-label={t("common.close")} onClick={closeOverlay}><Icon name="close" size={20} /></button>} />

      <section class="info-card">
        <span class="info-ico"><Icon name="shield" size={24} /></span>
        <div>
          <b>{t("data.localTitle")}</b>
          <p>{t("data.localText")}</p>
        </div>
      </section>

      <div class="stat-row">
        <div class="stat"><b>{d.notes.length}</b><small>{t("data.statNotes")}</small></div>
        <div class="stat"><b>{d.workouts.length}</b><small>{t("data.statWorkouts")}</small></div>
        <div class="stat"><b>{num(countMetrics(d.metrics) + d.habits.length + d.trackers.length, 0)}</b><small>{t("data.statEntries")}</small></div>
      </div>
      <p class="muted small center">{bytes(size)} · {t("data.lastBackup", { date: d.settings.lastBackup ? formatDate(d.settings.lastBackup) : t("data.never") })}</p>

      <h2 class="section-title">{t("data.saveSection")}</h2>
      <SaveOptions make={backupBlob} name={backupFileName()} busy={busy} run={run} onDone={markBackedUp}
        caption={t("data.backupCaption", { date: formatDate(Date.now()) })} />
      <div class="card list">
        <Row icon="copy" color="linear-gradient(135deg,#D97706,#C2410C)" title={t("data.copyAsText")}
          sub={t("data.copyAsTextSub")} onClick={copy} />
      </div>
      {!serverOnline.value && (
        <p class="footnote">{t("data.noServer")}</p>
      )}

      <h2 class="section-title">{t("data.loadSection")}</h2>
      {pending ? (
        <Card class="import">
          <p class="muted small">{t("data.fileFrom", { date: pending.exportedAt ? formatDate(pending.exportedAt) : t("data.unknownDate") })}</p>
          <p><b>{summarize(pending.data)}</b></p>
          <button class="btn block" disabled={busy} onClick={() => applyImport("merge")}>{t("data.merge")}</button>
          <p class="muted small">{t("data.mergeNote")}</p>
          <button class="btn block ghost danger" disabled={busy} onClick={() => applyImport("replace")}>{t("data.replaceAll")}</button>
          <button class="text-btn center" onClick={() => setPending(null)}>{t("common.cancel")}</button>
        </Card>
      ) : (
        <div class="card list">
          <Row icon="upload" color="linear-gradient(135deg,#5B5BF6,#9B5CF6)" title={t("data.pickFile")} sub={t("data.pickFileSub")}
            onClick={() => fileInput.current?.click()} />
          <Row icon="copy" color="linear-gradient(135deg,#D97706,#C2410C)" title={t("data.pasteText")} sub={t("data.pasteTextSub")}
            onClick={() => setPasteOpen(!pasteOpen)} />
          <input ref={fileInput} type="file" accept=".json,application/json,text/plain" hidden onChange={onFile} />
        </div>
      )}
      {pasteOpen && !pending && (
        <Card>
          <textarea class="paste" placeholder={t("data.pastePlaceholder")} value={pasted}
            onInput={(e) => setPasted(e.currentTarget.value)} />
          <button class="btn block" disabled={!pasted.trim()} onClick={() => readText(pasted)}>{t("data.check")}</button>
        </Card>
      )}

      <h2 class="section-title">{t("data.obsidianSection")}</h2>
      <SaveOptions make={obsidianZip} name={`second-brain-obsidian-${dayKey()}.zip`} busy={busy} run={run}
        caption={t("data.obsidianCaption")} />

      <h2 class="section-title">{t("data.dangerZone")}</h2>
      <div class="card list">
        <Row icon="trash" title={t("data.wipeAll")} sub={t("data.wipeAllSub")} danger onClick={wipe} right={<span />} />
      </div>
    </>
  );
}
