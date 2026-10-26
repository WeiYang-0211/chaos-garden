import { DEFAULT_SETTINGS, PACE_OPTIONS } from "../data/personas.js";

const SETTINGS_KEY = "douwen.settings.v1";
const HISTORY_KEY = "douwen.history.v1";
const HISTORY_LIMIT = 12;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY, {});
  const settings = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  if (settings.engine !== "llm") settings.engine = "local";
  if (!PACE_OPTIONS[settings.pace]) settings.pace = DEFAULT_SETTINGS.pace;
  for (const key of ["endpoint", "apiKey", "modelA", "modelB", "modelJudge"]) {
    if (typeof settings[key] !== "string") settings[key] = DEFAULT_SETTINGS[key];
  }
  settings.sound = Boolean(settings.sound);
  return settings;
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}

export function loadHistory() {
  const stored = read(HISTORY_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item) => item && (item.mode === "debate" || item.mode === "poetry" || item.mode === "chain") && item.timestamp)
    .slice(0, HISTORY_LIMIT);
}

export function addHistory(entry) {
  const history = [entry, ...loadHistory().filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
  write(HISTORY_KEY, history);
  return history;
}

export function clearHistory() {
  write(HISTORY_KEY, []);
  return [];
}
