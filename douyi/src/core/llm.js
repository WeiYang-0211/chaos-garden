import { SSEDecoder, extractChatDelta, extractChatError } from "./sse.js";

export class ChatError extends Error {
  constructor(message, { status = 0, detail = "" } = {}) {
    super(message);
    this.name = "ChatError";
    this.status = status;
    this.detail = detail;
  }
}

export function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === 20 || /aborted|abort/i.test(String(error?.message || ""));
}

function normalizeError(payload, status) {
  const message = payload?.error || payload?.message || `模型服务返回 ${status}`;
  return new ChatError(String(message), { status, detail: payload?.detail || "" });
}

async function readErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return new ChatError(`模型服务返回 ${response.status}`, { status: response.status });
  try {
    const payload = JSON.parse(text);
    return normalizeError(payload, response.status);
  } catch {
    return new ChatError(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || `模型服务返回 ${response.status}`, {
      status: response.status,
    });
  }
}

function consumeEvent(event, onDelta) {
  if (!event?.data) return false;
  if (event.data === "[DONE]") return true;
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch {
    return false;
  }
  const error = extractChatError(payload);
  if (error) throw new ChatError(error);
  const delta = extractChatDelta(payload);
  if (delta) onDelta(delta);
  return false;
}

export async function streamChat(options, onDelta = () => {}, signal) {
  const {
    endpoint,
    apiKey = "",
    model,
    messages,
    temperature = 0.9,
    maxTokens = 900,
    fetchImpl = globalThis.fetch,
  } = options;

  if (!fetchImpl) throw new ChatError("当前环境没有 fetch");

  const response = await fetchImpl("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, apiKey, model, messages, temperature, maxTokens }),
    signal,
  });

  if (!response.ok) throw await readErrorMessage(response);

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream") || !response.body) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      const error = extractChatError(payload);
      if (error) throw new ChatError(error);
      const delta = extractChatDelta(payload);
      if (delta) onDelta(delta);
      return delta;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError("模型没有返回可读的内容", { detail: text.slice(0, 200) });
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sse = new SSEDecoder();
  let full = "";
  let done = false;

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      const text = decoder.decode(value, { stream: true });
      for (const event of sse.push(text)) {
        if (consumeEvent(event, (delta) => {
          full += delta;
          onDelta(delta);
        })) {
          done = true;
          break;
        }
      }
    }
    if (!done) {
      for (const event of sse.end()) {
        if (consumeEvent(event, (delta) => {
          full += delta;
          onDelta(delta);
        })) break;
      }
    }
  } finally {
    if (done) reader.cancel().catch(() => {});
  }

  return full;
}

export async function collectChat(options, signal) {
  return streamChat(options, () => {}, signal);
}

export function modelForSide(settings, side) {
  if (side === "judge") return settings.modelJudge || settings.modelA || settings.modelB;
  return side === "A" ? settings.modelA : settings.modelB;
}
