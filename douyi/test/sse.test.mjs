import test from "node:test";
import assert from "node:assert/strict";
import { SSEDecoder, extractChatDelta, extractChatError, parseSSEBlock } from "../src/core/sse.js";

test("解析单个 SSE 块", () => {
  const event = parseSSEBlock('event: message\ndata: {"a":1}\ndata: {"b":2}');
  assert.deepEqual(event, { event: "message", data: '{"a":1}\n{"b":2}' });
  assert.equal(parseSSEBlock(": ping"), null);
  assert.equal(parseSSEBlock("event: ping"), null);
});

test("解码器能处理任意切片", () => {
  const decoder = new SSEDecoder();
  const text = 'data: {"choices":[{"delta":{"content":"月"}}]}\n\ndata: {"choices":[{"delta":{"content":"出"}}]}\n\ndata: [DONE]\n\n';
  const chunks = [text.slice(0, 7), text.slice(7, 23), text.slice(23, 24), text.slice(24, 80), text.slice(80)];
  const events = [];
  for (const chunk of chunks) events.push(...decoder.push(chunk));
  events.push(...decoder.end());
  assert.deepEqual(events.map((event) => event.data), [
    '{"choices":[{"delta":{"content":"月"}}]}',
    '{"choices":[{"delta":{"content":"出"}}]}',
    "[DONE]",
  ]);
});

test("解码器处理 CRLF 与多行 data", () => {
  const decoder = new SSEDecoder();
  const events = decoder.push('event: x\r\ndata: a\r\ndata: b\r\n\r\n');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { event: "x", data: "a\nb" });
});

test("提取 delta 的多种兼容格式", () => {
  assert.equal(extractChatDelta({ choices: [{ delta: { content: "月" } }] }), "月");
  assert.equal(extractChatDelta({ choices: [{ message: { content: "月" } }] }), "月");
  assert.equal(extractChatDelta({ choices: [{ text: "月" }] }), "月");
  assert.equal(extractChatDelta({ choices: [{ delta: { content: "" } }] }), "");
  assert.equal(extractChatDelta({}), "");
  assert.equal(extractChatDelta(null), "");
});

test("提取错误信息", () => {
  assert.equal(extractChatError({ error: { message: "额度不足" } }), "额度不足");
  assert.equal(extractChatError({ error: "拒绝访问" }), "拒绝访问");
  assert.equal(extractChatError({}), "");
});
