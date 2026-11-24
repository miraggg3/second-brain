// Entry point: loaded last, after all feature files.

function onBack() {
  if (sheetOpen()) return closeSheet(null);
  if (currentOverlay) return closeOverlay();
}

async function start() {
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.BackButton) tg.BackButton.onClick(onBack);
  }

  await loadAll();
  applyTheme();
  initNotes();
  showTab(activeWorkout() ? "gym" : "today");
  setInterval(tickTimers, 1000);

  refreshPremium();
}

start();
