const TOAST_TONES = new Set(["info", "warn", "error", "success"]);

export function h(tag, props, ...children) {
  const element = document.createElement(tag);
  if (props && typeof props === "object") {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class" || key === "className") {
        element.className = String(value);
      } else if (key === "text") {
        element.textContent = String(value);
      } else if (key === "style") {
        if (typeof value === "string") {
          element.setAttribute("style", value);
        } else {
          for (const [property, propertyValue] of Object.entries(value)) {
            if (property.startsWith("--")) element.style.setProperty(property, String(propertyValue));
            else element.style[property] = propertyValue;
          }
        }
      } else if (key === "dataset") {
        for (const [dataKey, dataValue] of Object.entries(value)) {
          if (dataValue != null) element.dataset[dataKey] = String(dataValue);
        }
      } else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "value") {
        element.value = value;
      } else if (key === "checked" || key === "disabled" || key === "selected") {
        element[key] = Boolean(value);
        if (value) element.setAttribute(key, "");
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
  append(element, ...children);
  return element;
}

export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  return element;
}

export function replace(host, ...children) {
  clear(host);
  append(host, ...children);
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return [...scope.querySelectorAll(selector)];
}

export function setText(element, text) {
  if (element && element.textContent !== String(text)) element.textContent = String(text);
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`;
}

export function formatDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function sleep(milliseconds, signal) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function toast(message, { tone = "info", duration = 4200 } = {}) {
  const root = document.getElementById("toast-root");
  if (!root) return () => {};
  const safeTone = TOAST_TONES.has(tone) ? tone : "info";
  const item = h(
    "div",
    { class: `toast toast--${safeTone}`, role: "status" },
    h("span", { class: "toast__mark", "aria-hidden": "true" }),
    h("span", { class: "toast__text" }, message)
  );
  while (root.children.length >= 3) root.removeChild(root.firstElementChild);
  root.appendChild(item);
  const timer = setTimeout(() => {
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 260);
  }, duration);
  return () => {
    clearTimeout(timer);
    item.remove();
  };
}

export function confirmDialog({
  title = "确认",
  message = "",
  detail = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
} = {}) {
  const layer = document.getElementById("layer-root") || document.body;
  return new Promise((resolve) => {
    let settled = false;
    const dialog = h(
      "dialog",
      { class: "dialog dialog--confirm", "aria-label": title },
      h(
        "div",
        { class: "confirm-card" },
        h("div", { class: "confirm-top" }, h("span", { class: "seal seal--small" }, "慎"), h("span", { class: "eyebrow" }, "DOUWEN / CONFIRM")),
        h("h2", { class: "confirm-title" }, title),
        h("p", { class: "confirm-message" }, message),
        detail ? h("p", { class: "confirm-detail" }, detail) : null,
        h(
          "div",
          { class: "confirm-actions" },
          h(
            "button",
            {
              type: "button",
              class: "button button--ghost",
              onClick: () => finish(false),
            },
            cancelLabel
          ),
          h(
            "button",
            {
              type: "button",
              class: `button ${danger ? "button--danger" : "button--primary"}`,
              onClick: () => finish(true),
            },
            confirmLabel
          )
        )
      )
    );

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      dialog.close();
    };

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
      dialog.remove();
    });

    layer.appendChild(dialog);
    dialog.showModal();
  });
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const textarea = h("textarea", { style: { position: "fixed", opacity: "0", top: "0" } });
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function randomId(prefix = "id") {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}
