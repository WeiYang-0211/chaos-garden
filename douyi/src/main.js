import { Arena } from "./ui/arena.js";
import { confirmDialog, randomId, toast } from "./ui/dom.js";
import { createLobby } from "./ui/lobby.js";
import { openSettingsDialog } from "./ui/settings.js";
import { openSetupDialog } from "./ui/setup.js";
import { SoundBoard } from "./ui/sound.js";
import {
  addHistory,
  clearHistory,
  loadHistory,
  loadSettings,
  saveSettings,
} from "./ui/storage.js";

const app = document.getElementById("app");
const state = {
  settings: loadSettings(),
  history: loadHistory(),
  screen: "lobby",
  arena: null,
};
const sound = new SoundBoard(state.settings.sound);
let settingsPromise = null;

function disposeArena() {
  if (!state.arena) return;
  state.arena.dispose();
  state.arena = null;
}

function renderLobby({ preserveScroll = false } = {}) {
  disposeArena();
  state.screen = "lobby";
  document.body.dataset.screen = "lobby";
  document.title = "斗文台 · AI 互斗观测站";
  const scroll = window.scrollY;
  app.replaceChildren(
    createLobby({
      settings: state.settings,
      history: state.history,
      onMode: openSetup,
      onSettings: () => configureSettings(),
      onClearHistory: clearLocalHistory,
    })
  );
  if (preserveScroll) window.scrollTo({ top: scroll, behavior: "instant" });
  else window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(() => document.body.classList.add("is-ready"));
}

async function configureSettings() {
  if (settingsPromise) return settingsPromise;
  settingsPromise = (async () => {
    const next = await openSettingsDialog({ settings: state.settings });
    if (!next) return null;
    state.settings = next;
    saveSettings(next);
    sound.setEnabled(next.sound);
    if (state.screen === "lobby") renderLobby({ preserveScroll: true });
    return next;
  })();
  try {
    return await settingsPromise;
  } finally {
    settingsPromise = null;
  }
}

function openSetup(mode) {
  openSetupDialog({
    mode,
    settings: state.settings,
    onConfigure: () => configureSettings(),
    onStart: (spec) => startBattle(spec),
  });
}

function historyEntry(verdict) {
  return {
    id: verdict.id,
    mode: verdict.mode,
    title: verdict.title,
    subtitle: verdict.subtitle,
    fighters: {
      A: { name: verdict.fighters.A.name, title: verdict.fighters.A.title },
      B: { name: verdict.fighters.B.name, title: verdict.fighters.B.title },
    },
    winner: verdict.winner,
    totals: verdict.totals,
    timestamp: verdict.timestamp,
    engine: verdict.engine,
    degraded: verdict.degraded,
    forfeit: verdict.forfeit,
  };
}

function startBattle(spec) {
  disposeArena();
  state.screen = "arena";
  document.body.dataset.screen = "arena";
  document.title =
    spec.mode === "debate"
      ? `${spec.topic.slice(0, 24)} · 斗文台`
      : spec.mode === "poetry"
        ? `飞花令「${spec.keyword}」 · 斗文台`
        : `成语接龙「${spec.startChar}」 · 斗文台`;

  const arena = new Arena({
    mount: app,
    spec,
    settings: state.settings,
    sound,
    callbacks: {
      onFinish: (verdict) => {
        state.history = addHistory(historyEntry(verdict));
      },
      onRematch: () => {
        startBattle({ ...spec, seed: randomId("rematch") });
      },
      onLobby: () => renderLobby(),
      onSoundChange: (enabled) => {
        state.settings.sound = enabled;
        saveSettings(state.settings);
        sound.setEnabled(enabled);
      },
    },
  });
  state.arena = arena;
  arena.start();
}

async function clearLocalHistory() {
  const confirmed = await confirmDialog({
    title: "清空往战记录？",
    message: "只会删掉这台浏览器里的对局摘要，不能恢复。",
    confirmLabel: "清空",
    cancelLabel: "留着",
    danger: true,
  });
  if (!confirmed) return;
  state.history = clearHistory();
  renderLobby({ preserveScroll: true });
  toast("往战记录已清空。", { tone: "info" });
}

window.addEventListener("pagehide", () => disposeArena());
window.addEventListener("error", (event) => {
  if (event?.error) console.error(event.error);
});

renderLobby();
