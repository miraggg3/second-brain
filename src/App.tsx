import { useEffect } from "preact/hooks";
import { effect } from "@preact/signals";
import { data, loadAll, loaded } from "./store";
import { closeOverlay, goTab, overlay, tab, type Tab } from "./nav";
import { activeWorkout } from "./domain";
import { refreshPremium } from "./premium";
import { canUse, haptic, tg, tgUser } from "./telegram";
import { Avatar, closeSheet, Icon, Sheet, sheet, Toast, type IconName } from "./ui";
import { Today } from "./screens/Today";
import { Gym } from "./screens/Gym";
import { NoteEditor, Notes, saveEditor } from "./screens/Notes";
import { Progress } from "./screens/Progress";
import { Profile } from "./screens/Profile";
import { PremiumScreen } from "./screens/Premium";
import { DataScreen } from "./screens/DataScreen";
import { Appearance } from "./screens/Appearance";
import { closeHoldMenu, holdMenu, HoldMenuLayer, installHoldGestures } from "./gestures";
import { t, type Key } from "./i18n";
import { setThemeTranslator } from "./themes";

setThemeTranslator(t);

const TABS: { id: Tab; label: Key; icon: IconName }[] = [
  { id: "today", label: "tab.today", icon: "today" },
  { id: "gym", label: "tab.gym", icon: "gym" },
  { id: "notes", label: "tab.notes", icon: "notes" },
  { id: "progress", label: "tab.progress", icon: "progress" },
  { id: "profile", label: "tab.profile", icon: "profile" },
];

function onBack() {
  if (holdMenu.value) return closeHoldMenu();
  if (sheet.value) return closeSheet();
  const o = overlay.value;
  if (o?.name === "editor") saveEditor(o.id);
  closeOverlay();
}

function TabBar() {
  return (
    <nav class="tabbar">
      {TABS.map((b) => (
        <button key={b.id} class={tab.value === b.id ? "on" : ""} onClick={() => { haptic(); goTab(b.id); }}>
          {b.id === "profile" && tgUser
            ? <Avatar name={tgUser.first_name} photo={tgUser.photo_url} seed={tgUser.id} size={24} />
            : <Icon name={b.icon} size={23} />}
          <span>{t(b.label)}</span>
        </button>
      ))}
    </nav>
  );
}

export function App() {
  useEffect(() => {
    installHoldGestures(); // hold: menu, hold and move: drag (gestures.tsx)
    if (tg) {
      tg.ready();
      tg.expand();
      if (canUse("7.7")) tg.disableVerticalSwipes?.(); // scrolling never closes the app
      if (canUse("6.1")) tg.BackButton.onClick(onBack);
    }
    loadAll().then(() => {
      if (activeWorkout(data.value.workouts)) tab.value = "gym";
      refreshPremium();
    });
    // Telegram's back button follows overlays and the sheet
    return effect(() => {
      if (!canUse("6.1")) return;
      if (overlay.value || sheet.value || holdMenu.value) tg!.BackButton.show();
      else tg!.BackButton.hide();
    });
  }, []);

  if (!loaded.value) return <div class="boot"><span class="boot-dot" /></div>;

  const o = overlay.value;
  let screen;
  if (o?.name === "editor") screen = <NoteEditor key={o.id ?? "new"} id={o.id} />;
  else if (o?.name === "premium") screen = <PremiumScreen />;
  else if (o?.name === "data") screen = <DataScreen />;
  else if (o?.name === "appearance") screen = <Appearance />;
  else if (tab.value === "today") screen = <Today />;
  else if (tab.value === "gym") screen = <Gym />;
  else if (tab.value === "notes") screen = <Notes />;
  else if (tab.value === "progress") screen = <Progress />;
  else screen = <Profile />;

  return (
    <>
      <div class="backdrop" aria-hidden="true" />
      <main class={`page ${o ? "overlay" : ""}`} key={o ? o.name : tab.value}>{screen}</main>
      {!o && <TabBar />}
      <HoldMenuLayer />
      <Sheet />
      <Toast />
    </>
  );
}
