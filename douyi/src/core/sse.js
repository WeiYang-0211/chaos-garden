export function parseSSEBlock(block) {
  const lines = block.split("\n");
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
      continue;
    }
  }
  if (!data.length) return null;
  return { event, data: data.join("\n") };
}

export class SSEDecoder {
  constructor() {
    this.buffer = "";
  }

  push(chunk) {
    this.buffer += String(chunk ?? "").replace(/\r\n/g, "\n");
    const events = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseSSEBlock(block);
      if (event) events.push(event);
      boundary = this.buffer.indexOf("\n\n");
    }
    return events;
  }

  end() {
    const rest = this.buffer;
    this.buffer = "";
    const event = parseSSEBlock(rest);
    return event ? [event] : [];
  }
}

export function extractChatDelta(payload) {
  if (!payload || typeof payload !== "object") return "";
  const choice = payload.choices?.[0];
  if (!choice) return "";
  return (
    choice.delta?.content ??
    choice.message?.content ??
    choice.text ??
    ""
  );
}

export function extractChatError(payload) {
  if (!payload || typeof payload !== "object") return "";
  const error = payload.error;
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message || error.code || "模型返回错误";
}
