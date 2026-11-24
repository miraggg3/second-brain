import { useEffect } from "preact/hooks";
import { effect } from "@preact/signals";
import { data, loadAll, loaded } from "./store";
import { closeOverlay, goTab, overlay, tab, type Tab } from "./nav";
import { activeWorkout } from "./domain";
import { refreshPremium } from "./premium";
import { canUse, haptic, tg } from "./telegram";
import { closeSheet, Icon, Sheet, sheet, Toast, type IconName } from "./ui";
import { Today } from "./screens/Today";
import { Gym } from "./screens/Gym";
import { NoteEditor, Notes, saveEditor } from "./screens/Notes";
import { Progress } from "./screens/Progress";
import { PremiumScreen } from "./screens/Premium";
import { DataScreen } from "./screens/DataScreen";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "День", icon: "day" },
  { id: "gym", label: "Зал", icon: "gym" },
  { id: "notes", label: "Заметки", icon: "notes" },
  { id: "progress", label: "Прогресс", icon: "progress" },
];

function onBack() {
  if (sheet.value) return closeSheet();
  const o = overlay.value;
  if (o?.name === "editor") saveEditor(o.id);
  closeOverlay();
}

function TabBar() {
  return (
    <nav class="tabbar">
      {TABS.map((t, i) => (
        <button key={t.id} class={tab.value === t.id ? "on" : ""} onClick={() => { haptic(); goTab(t.id); }}>
          <Icon name={t.icon} size={20} />
          <span><i class="mono">{`0${i + 1}`}</i>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function App() {
  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      if (canUse("7.7")) tg.disableVerticalSwipes?.(); // so scrolling never closes the app
      if (canUse("6.1")) tg.BackButton.onClick(onBack);
    }
    loadAll().then(() => {
      if (activeWorkout(data.value.workouts)) tab.value = "gym";
      refreshPremium();
    });
    // Telegram back button follows overlays and the sheet
    return effect(() => {
      if (!canUse("6.1")) return;
      if (overlay.value || sheet.value) tg!.BackButton.show();
      else tg!.BackButton.hide();
    });
  }, []);

  if (!loaded.value) return <div class="boot mono">загрузка…</div>;

  const o = overlay.value;
  let screen;
  if (o?.name === "editor") screen = <NoteEditor key={o.id ?? "new"} id={o.id} />;
  else if (o?.name === "premium") screen = <PremiumScreen />;
  else if (o?.name === "data") screen = <DataScreen />;
  else if (tab.value === "today") screen = <Today />;
  else if (tab.value === "gym") screen = <Gym />;
  else if (tab.value === "notes") screen = <Notes />;
  else screen = <Progress />;

  return (
    <>
      <main class={`page ${o ? "overlay" : ""}`}>{screen}</main>
      {!o && <TabBar />}
      <Sheet />
      <Toast />
    </>
  );
}
