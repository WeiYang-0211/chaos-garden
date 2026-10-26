import { DEBATE_RUBRIC, IDIOM_RUBRIC, POETRY_RUBRIC } from "../data/personas.js";
import { normalizeLine, validatePoetryAttempt } from "./poetry.js";
import {
  CHAIN_CORE_INDEX,
  IDIOM_INDEX,
  normalizeIdiom,
  validateChainAttempt,
} from "./idioms.js";
import { scoreTotal } from "./judge.js";

export function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = (hashString(seed) || 0x9e3779b9) >>> 0;
  return function rng() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function pick(rng, list) {
  if (!list.length) return "";
  return list[Math.floor(rng() * list.length)];
}

function countMatches(text, pattern) {
  return (String(text).match(pattern) || []).length;
}

export function cleanTopic(topic) {
  return String(topic ?? "")
    .trim()
    .replace(/[「」“”"]/g, "")
    .replace(/[。！？!?；;，,…\s]+$/g, "")
    .slice(0, 80) || "这一命题";
}


const DEBATE_BANK = {
  mosho: {
    hooks: [
      (T) => `先把话说准。讨论「${T}」，不能从愿望出发，要从可验证的后果出发。`,
      (T) => `这道题真正难的地方，不是表态，而是替「${T}」找一条能落地的路。`,
      () => "我方先把判准摆上桌：一个主张是否成立，要看它的收益能否覆盖代价，而不是看它听起来是否动人。",
    ],
    claims: [
      (T) => `对「${T}」的判断，不能只看最好的情形。任何制度都有失败模式，真正负责的做法，是把最坏的情形也写进账本。`,
      (T) => `这个命题一旦落到执行层，就会遇到激励问题。你奖励什么，人就会生产什么；你惩罚什么，人就会隐藏什么。`,
      (T) => `把「${T}」当成天然正确，就已经跳过了论证。正确性不是起点，而是结论。`,
      (T) => `讨论「${T}」必须问量级：收益也许是局部的，风险却可能是系统性的，这两者不能用一句「总体上」轻轻带过。`,
      (T) => `我方不否认对方口中的善意，但善意不是制度。制度要回答的是：当执行者平庸、甚至自私时，它是否仍然成立。`,
      (T) => `把「${T}」从口号拆成机制，至少要回答三件事：谁决定、谁监督、错了谁负责。`,
    ],
    quoteLines: [
      (Q) => `对方说「${Q}」。这句话有一半是对的，但恰好是无关紧要的那一半。`,
      (Q) => `对方说「${Q}」，听上去很稳，可它回答的是另一个问题：愿望是否动人，而不是方案是否可行。`,
      (Q) => `请停一下。对方说「${Q}」，请把这句话里的前提也一起说出来。`,
    ],
    counters: [
      "请对方把举证责任接过去：改变现状的收益，究竟由什么来保证？",
      "如果这个推论成立，那么对象的量级、执行的激励、失败的退路，都必须一起成立。对方只证明了第一项。",
      "请对方不要用意图为结果担保。善意可以解释动机，不能解释后果。",
    ],
    openers: [
      "下面，我用三层理由说明为什么。",
      "我方把这场辩论拆成三个问题。",
      "先给结论，再给理由。",
    ],
    closers: [
      "以上三层，任何一层被推翻，都足以让对方的结论失去支点。",
      "账本已经摊开，请对方逐条回应。",
      "所以，我方要的不是更动听的表态，而是能承担后果的答案。",
    ],
    fact: [
      "对方始终没有给出可检验的判准，只用「总体上是好的」带过了量级问题。",
      "对方举了很多例子，却没有证明这些例子能拼成一张完整的因果图。",
    ],
    value: [
      "对方把「意图」当成了「结果」，把善意当成了免责条款。",
      "对方把「方向正确」当成了「代价不重要」，这是两回事。",
    ],
    cost: [
      "改变一旦失败，成本不会平均分摊，它会先落到最没有议价能力的人身上。",
      "收益写在纸上，代价写在人身上；对方只给我们看了纸。",
    ],
    finals: [
      "所以，我方不反对善意，我方反对没有边界的善意。请把票投给那个愿意为最坏情形负责的答案。",
      "判断一道题，不能只看它许诺了什么，还要看它惩罚谁、奖励谁。请把票投给账本清楚的一边。",
    ],
  },

  zhuangsheng: {
    hooks: [
      (T) => `「${T}」听起来像一道是非题，其实更像一条河：站在岸上的人，永远不知道水有多深。`,
      () => "今天我不急着下判词，先请各位看一幅画。",
      () => "有些命题像月亮，远看只有一个答案；走近了，才发现背面全是阴影。",
    ],
    claims: [
      (T) => `想象一间屋子：所有人都同意开窗，却没人愿意站在风口。「${T}」也是这样——愿望是共同的，代价却是分层的。`,
      () => "一条河改了道，岸上的人不会同时收到通知。制度先改变强者的选择，再让弱者承担后果。",
      (T) => `把「${T}」当成一把钥匙之前，先看看它开的是门，还是别人家的锁。`,
      () => "我们常把「可以」误认成「应当」。中间那一步，不是修辞，是责任。",
      (T) => `「${T}」若只是一幅好看的画，挂在墙上无妨；可它一旦变成路，就得有人走夜路。`,
      () => "对方在谈山顶的风景，我方在问山脚的台阶。不是我们扫兴，是总得有人看看谁上得去。",
    ],
    quoteLines: [
      (Q) => `对方说「${Q}」。这像在河边指着一朵浪花，说整条河都是这个样子。`,
      (Q) => `对方把「${Q}」讲得很美。可一幅画不能当地图用，它不会告诉你哪里是悬崖。`,
      (Q) => `对方说「${Q}」，我先承认画面很好看；但请别用画面代替路。`,
    ],
    counters: [
      "对方画了一扇很美的窗，但窗外是不是悬崖，还没有人回答。",
      "请对方把那个被概括掉的人，重新放回这幅画里。",
      "如果这个答案只能在纸上成立，那它就不是答案，只是一句诗。",
    ],
    openers: [
      "让我把这个问题换一个看法。",
      "先不争定义，我们说一个具体的情境。",
      "这件事，得从画面之外看。",
    ],
    closers: [
      "三幅画说完，问题还在原地：这条路，谁走？",
      "所以我方提醒各位：动人的答案，未必是能走的路。",
      "请对方先回答那个站在风口的人。",
    ],
    fact: [
      "对方举了很多漂亮的例子，却没有证明这些例子能拼成一张地图。",
      "对方描述了一朵浪花，却始终没有说明整条河的流向。",
    ],
    value: [
      "对方把「可以想象」当成了「已经发生」，中间隔着一条现实的河。",
      "对方把美感当成了论据，可动人不等于成立。",
    ],
    cost: [
      "开窗的人站在屋里，吹风的人站在屋外。代价从来不是抽象的。",
      "一条路修得再好看，走夜路的人还是得自己带灯。",
    ],
    finals: [
      (T) => `月亮可以照亮河面，但不能替人过河。「${T}」若真有价值，它必须经得起普通人走夜路。`,
      "请把票投给那条有人走过、也有人修得起的路，而不是那幅最好看的画。",
    ],
  },

  zongheng: {
    hooks: [
      (T) => `今天这道题，不是文字游戏。它问的是：谁得利，谁付账，谁在最后收拾残局。`,
      (T) => `我方只问三件事：代价、权力、退路。答不上来，「${T}」就只是一句好听的话。`,
      (T) => `先把漂亮话放一边。「${T}」要成立，得拿出能执行的方案。`,
    ],
    claims: [
      (T) => `第一，代价。任何「${T}」都不是免费的，账总有人付；第二，权力，谁来决定、谁来监督；第三，退路，错了能不能改。`,
      () => "不要只谈收益。收益写在纸上，代价写在人身上。",
      () => "一项改变如果只能靠最理想的人来执行，那它就不是制度，是许愿。",
      (T) => `今天为了「${T}」退一步，明天就会为下一个方便再退一步。原则一旦让位，就再也回不来。`,
      (T) => `对方可以继续描绘愿景，但请先回答：预算从哪来，权力交给谁，失败谁担责。`,
      (T) => `「${T}」不是一句口号，它要落到规则、资源和后果上。拿不出方案，就别拿愿景当论据。`,
    ],
    quoteLines: [
      (Q) => `停一下。对方说「${Q}」，请把这句话里的前提也一起说出来。`,
      (Q) => `对方说「${Q}」。好，那我们就按这句话往下推：预算呢？监督呢？失败之后谁来改？`,
      (Q) => `对方说「${Q}」，这更像愿景，不像方案。`,
    ],
    counters: [
      "请对方正面回答：失败了，谁负责？",
      "请把方案、预算和责任人一起端上来，不要只端一句口号。",
      "如果答案只有方向，没有路径，那它就不是答案。",
    ],
    openers: [
      "我方只讲三笔账。",
      "先给结论：这个命题经不起执行层的追问。",
      "把话挑明，这场辩论比的是谁愿意为后果签字。",
    ],
    closers: [
      "账本就摆在这里。请对方逐条回应。",
      "三笔账，对方一笔都没有结清。",
      "所以，请把票投给能承担后果的一边。",
    ],
    fact: [
      "对方没有回答预算、权力和退路这三笔账。",
      "对方只给了方向，没有给路径，更没有给失败的预案。",
    ],
    value: [
      "对方把「方向正确」当成了「代价不重要」，这是两回事。",
      "对方把善意当成了执行力，可执行力从来不靠善意。",
    ],
    cost: [
      "收益写在纸上，代价写在人身上；对方只给我们看了纸。",
      "今天不把代价说清楚，明天就会有人替这个决定付账。",
    ],
    finals: [
      "愿景可以很大，账本必须很清。请把票投给能承担后果的一边。",
      "不要用方向代替路径，不要用善意代替责任。请对方回答最后一遍：谁付账？",
    ],
  },

  wenyan: {
    hooks: [
      (T) => `在谈「${T}」之前，我想先说一个人：一个没有议价能力、却必须承受结果的人。`,
      (T) => `这场辩论很容易变成两套口号的碰撞。我方想把话筒往下递一点，听听那些被「总体上」概括掉的人。`,
      (T) => `我理解对方为什么急着要一个答案。可越是这样，越要先问：这个答案会落到谁身上。`,
    ],
    claims: [
      (T) => `先别急着谈宏大叙事。对一个具体的人来说，「${T}」可能只是一次被代表、一次被统计、一次没人问过意见的决定。`,
      () => "我承认对方的担忧是真实的，但担忧不能代替答案。我们要问的是：有没有一种安排，既承认风险，又给弱者留下申诉的门。",
      (T) => `「${T}」若只让强者更自由、让弱者更沉默，那它就不是进步，只是换了一种不均。`,
      () => "制度最动人的地方，不是它多正确，而是它愿意为犯错留一条修正的路。",
      (T) => `我们讨论「${T}」，最终不是为了赢一场辩论，而是为了决定：当一个人落入最坏的情形时，还有没有人接住他。`,
      () => "请对方先别用「总体上」三个字。总体是统计，具体的人不是。",
    ],
    quoteLines: [
      (Q) => `对方说「${Q}」。我听见了，但这句话里有一个人的位置是空的。`,
      (Q) => `对方说「${Q}」，先假设它成立。那我们更该问：谁来保证那个最容易被忽略的人，不会被落下？`,
      (Q) => `对方说「${Q}」。这句话对多数人也许成立，可制度不该只对多数人成立。`,
    ],
    counters: [
      "请对方别忘了，制度失败时，最先被牺牲的从来不是制定规则的人。",
      "请把「总体上更好」拆开，告诉我们：谁更好，谁更差，差的那个人有没有申诉的门。",
      "如果这个答案需要有人沉默才能成立，那它就还不是一个好答案。",
    ],
    openers: [
      "我先讲一个具体的人，再讲道理。",
      "在给结论之前，我们先看看结论落在谁身上。",
      "这不是一道抽象题，它有具体的人。",
    ],
    closers: [
      "所以，我方要的不是一个更漂亮的答案，而是一个更有人味的答案。",
      "请对方在最后回答：那个最没有议价能力的人，怎么办？",
      "制度可以出错，但不能假装没有人会被它伤到。",
    ],
    fact: [
      "对方谈了很多「多数人」，却没有说清那个落在最坏处的人怎么办。",
      "对方用统计上的平均，盖住了具体处境里的差异。",
    ],
    value: [
      "对方把「总体上更好」当成了「每个人都更好」，可统计不会替具体的人疼。",
      "对方把效率放在了尊严前面，这个排序本身就是一种价值判断。",
    ],
    cost: [
      "当制度出错时，最先被牺牲的，往往不是制定规则的人。",
      "那些没有议价能力的人，最后往往要替整个方案承担误差。",
    ],
    finals: [
      "我们终究要回答的不是「这件事好不好听」，而是一个更小的问题：当那个人落到最坏处，我们有没有给他留一扇门。",
      "请把票投给一个愿意接住人的答案，而不是一个只愿意说服人的答案。",
    ],
  },
};

function personaBank(persona) {
  return DEBATE_BANK[persona?.id] || DEBATE_BANK.mosho;
}

function resolvePool(pool, topic) {
  return pool.map((item) => (typeof item === "function" ? item(topic) : item)).filter(Boolean);
}

function takeLine(rng, pool, used, topic) {
  const resolved = resolvePool(pool, topic);
  const fresh = resolved.filter((line) => !used.has(line));
  const chosen = pick(rng, fresh.length ? fresh : resolved);
  if (chosen) used.add(chosen);
  return chosen;
}

export function extractQuote(transcript, ownSide, rng) {
  const previous = [...(transcript || [])].reverse().find((item) => item.side !== ownSide);
  if (!previous) return "";

  const clean = (value) =>
    String(value)
      .replace(/[「」『』“”"]/g, "")
      .replace(/^[\s，,、：:；;]+|[\s，,、：:；;]+$/g, "")
      .trim();

  const sentences = String(previous.text || "")
    .split(/[。！？!?；;\n]/)
    .flatMap((line) => (line.length > 36 ? line.split(/[，,、]/) : [line]))
    .map(clean)
    .filter((line) => line.length >= 7 && line.length <= 38);

  if (!sentences.length) return "";

  const argumentative = sentences.filter((line) =>
    /不是|而是|必须|应当|如果|因为|所以|证明|真正|代价|风险|后果|制度|自由|责任/.test(line)
  );
  const pool = argumentative.length ? argumentative : sentences;
  let quote = pick(rng, pool);
  if (quote.length > 34) quote = `${quote.slice(0, 34)}…`;
  return quote;
}

export function createDebateMemory(seed) {
  return { rng: createRng(seed), used: new Set() };
}

export function generateDebateSpeech({ topic, side, phase, fighter, transcript = [], memory }) {
  const T = cleanTopic(topic);
  const bank = personaBank(fighter);
  const rng = memory?.rng || createRng(`${topic}-${side}-${phase.id || phase.index}-${Date.now()}`);
  const used = memory?.used || new Set();

  const stance =
    side === "A"
      ? `我方主张：「${T}」成立。`
      : `我方主张：「${T}」并不成立。`;

  if (phase.kind === "opening") {
    const hook = takeLine(rng, bank.hooks, used, T);
    const opener = takeLine(rng, bank.openers, used, T);
    const claims = [];
    for (let index = 0; index < 3; index += 1) {
      const claim = takeLine(
        rng,
        bank.claims.filter((line) => !claims.includes(typeof line === "function" ? line(T) : line)),
        used,
        T
      );
      if (claim) claims.push(claim);
    }
    const closer = takeLine(rng, bank.closers, used, T);
    return [hook, `${stance}${opener}`, ...claims, closer].filter(Boolean).join("\n\n");
  }

  if (phase.kind === "rebuttal") {
    const quote = extractQuote(transcript, side, rng);
    const quoteLine = quote
      ? takeLine(rng, bank.quoteLines, used, quote)
      : "对方刚才的论证有一个共同的起点：先把结论当成前提，再来解释现实。";
    const claimA = takeLine(rng, bank.claims, used, T);
    const claimB = takeLine(rng, bank.claims, used, T);
    const counter = takeLine(rng, bank.counters, used, T);
    return [quoteLine, claimA, claimB, counter].filter(Boolean).join("\n\n");
  }

  if (phase.kind === "free") {
    const quote = extractQuote(transcript, side, rng);
    const quoteLine = quote
      ? takeLine(rng, bank.quoteLines, used, quote)
      : "对方一直在谈愿望，我方一直在问方案。";
    const counter = takeLine(rng, bank.counters, used, T);
    const claim = takeLine(rng, bank.claims, used, T);
    return [quoteLine, counter, claim].filter(Boolean).join("\n\n");
  }

  const fact = takeLine(rng, bank.fact, used, T);
  const value = takeLine(rng, bank.value, used, T);
  const cost = takeLine(rng, bank.cost, used, T);
  const final = takeLine(rng, bank.finals, used, T);
  return [
    `打到最后一轮，分歧其实只剩三层：事实、价值、代价。`,
    `事实层面，${fact}`,
    `价值层面，${value}`,
    `代价层面，${cost}`,
    "我方不是没有看见对方的担忧。恰恰因为看见了，才不能把答案交给一句「相信」。",
    final,
  ]
    .filter(Boolean)
    .join("\n\n");
}


export function createPoetryMemory(seed) {
  return { rng: createRng(seed), authorCounts: new Map() };
}

function pickWeighted(rng, items, weightOf) {
  const weights = items.map((item) => Math.max(0.05, weightOf(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let ticket = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    ticket -= weights[index];
    if (ticket <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function choosePoetryLine({ keyword, used = [], persona, index, memory }) {
  const rng = memory?.rng || createRng(`${keyword}-${Date.now()}`);
  const authorCounts = memory?.authorCounts || new Map();
  const usedSet = new Set((used || []).map((line) => normalizeLine(typeof line === "string" ? line : line?.line)).filter(Boolean));
  const candidates = (index.byChar.get(keyword) || []).filter((entry) => !usedSet.has(normalizeLine(entry.text)));
  if (!candidates.length) return null;

  const preferences = persona?.preferences || {};
  const chosen = pickWeighted(rng, candidates, (entry) => {
    let weight = 1;
    if (preferences.authors?.includes(entry.author)) weight += 2.4;
    if (preferences.dynasties?.includes(entry.dynasty)) weight += 0.7;
    if (preferences.forms?.includes(entry.form)) weight += 0.35;
    const authorCount = authorCounts.get(entry.author) || 0;
    weight /= 1 + authorCount * 0.55;
    return weight;
  });

  authorCounts.set(chosen.author, (authorCounts.get(chosen.author) || 0) + 1);
  return chosen;
}


function debateScores(speeches, rng) {
  const text = speeches.map((item) => item.text).join("");
  const count = speeches.length;
  const uniqueRatio = new Set(text).size / Math.max(1, text.length);
  const questions = countMatches(text, /？/g);
  const counters = countMatches(text, /对方/g);

  const structure = clamp(18 + count * 0.55 + Math.min(2.4, text.length / 900) + rng() * 1.7, 16, 25);
  const rebuttal = clamp(17 + Math.min(3.4, counters * 0.3) + Math.min(2, questions * 0.16) + rng() * 1.6, 14, 25);
  const expression = clamp(17 + Math.min(4.2, uniqueRatio * 9) + Math.min(2, text.length / 1100) + rng() * 1.4, 15, 25);
  const poise = clamp(19 + rng() * 3.2 + (text.length < 1500 ? 0.6 : 0), 15, 25);

  return {
    structure: round1(structure),
    rebuttal: round1(rebuttal),
    expression: round1(expression),
    poise: round1(poise),
  };
}

export function judgeDebateOffline({ topic, fighters, transcript, format, seed }) {
  const rng = createRng(seed || `${topic}-judge-${transcript.length}`);
  const speechesA = transcript.filter((item) => item.side === "A");
  const speechesB = transcript.filter((item) => item.side === "B");
  const A = debateScores(speechesA, rng);
  const B = debateScores(speechesB, rng);
  let totalA = round1(scoreTotal(A, DEBATE_RUBRIC));
  let totalB = round1(scoreTotal(B, DEBATE_RUBRIC));

  if (totalA === totalB) {
    if (countMatches(speechesA.map((s) => s.text).join(""), /对方/g) >= countMatches(speechesB.map((s) => s.text).join(""), /对方/g)) {
      A.poise = round1(Math.min(25, A.poise + 0.4));
    } else {
      B.poise = round1(Math.min(25, B.poise + 0.4));
    }
    totalA = round1(scoreTotal(A, DEBATE_RUBRIC));
    totalB = round1(scoreTotal(B, DEBATE_RUBRIC));
  }

  const winner = totalA === totalB ? "draw" : totalA > totalB ? "A" : "B";
  const winnerSide = winner === "draw" ? (totalA >= totalB ? "A" : "B") : winner;
  const loserSide = winnerSide === "A" ? "B" : "A";
  const winnerName = fighters[winnerSide].name;
  const loserName = fighters[loserSide].name;
  const winnerText = (winnerSide === "A" ? speechesA : speechesB).map((s) => s.text).join("");
  const loserText = (loserSide === "A" ? speechesA : speechesB).map((s) => s.text).join("");

  const edge =
    countMatches(winnerText, /对方/g) >= 2
      ? "几处正面回应都落在对方论证最薄的地方"
      : "把立论立得更稳，没有跟着对方的节奏跑";
  const gap =
    countMatches(loserText, /对方/g) >= 2
      ? "并非没有回应，只是最后没有把分歧收拢"
      : "立论完整，但几次交锋都绕开了对方最硬的地方";

  const commentaries = [
    `${winnerName}赢得不轻松。胜负手在驳论：${winnerName}${edge}。${loserName}的论证更完整，但${gap}。「${cleanTopic(topic)}」这道题，最终比的不是谁的声音大，而是谁愿意为结论付账。`,
    `这是一场可以复盘的局。${winnerName}把「${cleanTopic(topic)}」从口号拉回了代价，几次追问都逼到了具体处；${loserName}${gap}。若只看金句，双方接近；若看论证的闭合，胜负并不模糊。`,
    `${winnerName}的优势不在辞藻，而在收束：每轮都能把话头拉回「${cleanTopic(topic)}」的核心代价。${loserName}${gap}，于是把主动权一点点交了出去。本局判${winnerName}胜。`,
  ];

  return {
    winner,
    scores: { A, B },
    totals: { A: round1(scoreTotal(A, DEBATE_RUBRIC)), B: round1(scoreTotal(B, DEBATE_RUBRIC)) },
    commentary: pick(rng, commentaries),
    highlights: [`${winnerName}：${edge}`, `${loserName}：${gap}`],
    engine: "local",
    formatLabel: format?.name || "",
  };
}

function poetryStats(turns, side) {
  const own = turns.filter((turn) => turn.side === side);
  const verified = own.filter((turn) => turn.verified);
  const pending = own.length - verified.length;
  const authors = new Set(own.map((turn) => turn.entry?.author).filter(Boolean));
  const dynasties = new Set(own.map((turn) => turn.entry?.dynasty).filter(Boolean));
  const avgLatency = own.length ? own.reduce((sum, turn) => sum + (turn.latencyMs || 0), 0) / own.length : 0;
  return {
    lines: own.length,
    verified: verified.length,
    pending,
    authors,
    dynasties,
    avgLatency,
    verifiedRatio: own.length ? verified.length / own.length : 0,
    forms: new Set(own.map((turn) => turn.entry?.form).filter(Boolean)),
  };
}

function poetryScores(stats, rng) {
  const accuracy = clamp(30 - (stats.lines ? (stats.pending / stats.lines) * 4 : 18), 12, 30);
  const breadth = clamp(16 + stats.verifiedRatio * 8 + Math.min(4, stats.authors.size) + Math.min(2, stats.dynasties.size) + rng() * 1.6, 12, 30);
  const imagery = clamp(12 + Math.min(3, stats.dynasties.size) + Math.min(2.4, stats.forms.size * 1.2) + rng() * 2.2, 10, 20);
  const wit = clamp(20 - Math.max(0, stats.avgLatency / 1000 - 2.2) * 0.55 + rng() * 1.4, 8, 20);
  return {
    accuracy: round1(accuracy),
    breadth: round1(breadth),
    imagery: round1(imagery),
    wit: round1(wit),
  };
}

export function judgePoetryOffline({ keyword, fighters, turns, forfeit, seed }) {
  const rng = createRng(seed || `${keyword}-${turns.length}-${Date.now()}`);
  const statsA = poetryStats(turns, "A");
  const statsB = poetryStats(turns, "B");
  const A = poetryScores(statsA, rng);
  const B = poetryScores(statsB, rng);

  if (forfeit) {
    const side = forfeit.side;
    if (side === "A") {
      A.accuracy = Math.min(A.accuracy, 9);
    } else {
      B.accuracy = Math.min(B.accuracy, 9);
    }
  }

  const totalA = round1(scoreTotal(A, POETRY_RUBRIC));
  const totalB = round1(scoreTotal(B, POETRY_RUBRIC));

  let winner;
  if (forfeit) {
    winner = forfeit.side === "A" ? "B" : "A";
  } else if (totalA === totalB) {
    if (statsA.verified !== statsB.verified) winner = statsA.verified > statsB.verified ? "A" : "B";
    else if (statsA.authors.size !== statsB.authors.size) winner = statsA.authors.size > statsB.authors.size ? "A" : "B";
    else winner = "draw";
  } else {
    winner = totalA > totalB ? "A" : "B";
  }

  const winnerSide = winner === "draw" ? (totalA >= totalB ? "A" : "B") : winner;
  const loserSide = winnerSide === "A" ? "B" : "A";
  const winnerName = fighters[winnerSide].name;
  const loserName = fighters[loserSide].name;
  const winnerTurns = turns.filter((turn) => turn.side === winnerSide);
  const bestTurn = winnerTurns.find((turn) => turn.verified) || winnerTurns[0] || turns[0];
  const bestLine = bestTurn?.line || "";
  const winnerStats = winnerSide === "A" ? statsA : statsB;
  const loserStats = loserSide === "A" ? statsA : statsB;
  const bestClause = bestLine
    ? `最好的一句是「${bestLine}」${bestTurn?.entry ? `（${bestTurn.entry.dynasty}·${bestTurn.entry.author}《${bestTurn.entry.title}》）` : ""}。`
    : "";

  const weakness =
    loserStats.verifiedRatio + 0.1 < winnerStats.verifiedRatio
      ? "典籍命中"
      : loserStats.authors.size + 1 < winnerStats.authors.size
        ? "取句路数"
        : loserStats.avgLatency > winnerStats.avgLatency + 800
          ? "沉吟的速度"
          : "临门一句";
  const margin = Math.abs(totalA - totalB);

  let commentary;
  if (forfeit) {
    commentary = `${loserName}在「${keyword}」字前卡住了：${forfeit.message}。按规定，本局由${winnerName}收席。${winnerName}共接 ${winnerStats.lines} 句${bestLine ? `，最好的一句是「${bestLine}」` : ""}。席散，令字仍在。`;
  } else if (winner === "draw") {
    commentary = `「${keyword}」字一令，${turns.length} 句收席，双方判分只在毫厘之间，本局和。${bestClause}一边胜在${winnerStats.authors.size >= loserStats.authors.size ? "取句路数" : "临门一句"}，一边胜在${loserStats.verifiedRatio >= winnerStats.verifiedRatio ? "典籍命中" : "沉吟的速度"}。酒未尽，席已散。`;
  } else {
    commentary = `「${keyword}」字一令，${turns.length} 句收席，${winnerName}${margin < 1.5 ? "险胜" : "占先"}。${bestClause}${loserName}接得也不弱，但在${weakness}上略逊半筹。酒未尽，席已散，胜负只在一句之间。`;
  }

  return {
    winner,
    scores: { A, B },
    totals: { A: round1(scoreTotal(A, POETRY_RUBRIC)), B: round1(scoreTotal(B, POETRY_RUBRIC)) },
    commentary,
    highlights: [
      `${winnerName}：库中命中 ${winnerSide === "A" ? statsA.verified : statsB.verified} 句`,
      `${loserName}：库中命中 ${loserSide === "A" ? statsA.verified : statsB.verified} 句`,
    ],
    bestLine,
    engine: "local",
    keyword,
  };
}

export function validatedOfflinePick({ keyword, used, persona, index, memory }) {
  const entry = choosePoetryLine({ keyword, used, persona, index, memory });
  if (!entry) return { ok: false, reason: "no_line", line: "", entry: null };
  const check = validatePoetryAttempt(entry.text, { keyword, used, index });
  if (!check.ok) return { ok: false, reason: check.reason, line: check.line || "", entry: null, message: check.message };
  return {
    ok: true,
    line: entry.text,
    verified: true,
    entry,
    latencyMs: 0,
  };
}

export function createChainMemory(seed) {
  return { rng: createRng(seed) };
}

function chainUsedSet(used) {
  const set = new Set();
  for (const item of used || []) {
    const value = typeof item === "string" ? item : item?.idiom ?? item?.line;
    const normalized = normalizeIdiom(value);
    if (normalized) set.add(normalized);
  }
  return set;
}

function weightedIdiomPick(rng, pool, weightOf) {
  const weights = pool.map((idiom) => Math.max(0.05, weightOf(idiom)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let ticket = rng() * total;
  for (let index = 0; index < pool.length; index += 1) {
    ticket -= weights[index];
    if (ticket <= 0) return pool[index];
  }
  return pool[pool.length - 1];
}

function pickChainFrom(index, requiredChar, usedSet, persona, rng) {
  const candidates = (index.byFirst.get(requiredChar) || []).filter((idiom) => !usedSet.has(idiom));
  if (!candidates.length) return null;

  const safe = candidates.filter((idiom) => {
    const next = [...idiom][3];
    return (index.byFirst.get(next) || []).some((candidate) => !usedSet.has(candidate) && candidate !== idiom);
  });
  const pool = safe.length ? safe : candidates;
  const preferences = persona?.preferences?.chars || [];

  return weightedIdiomPick(rng, pool, (idiom) => {
    let weight = 1;
    for (const char of idiom) {
      if (preferences.includes(char)) weight += 0.45;
    }
    const next = [...idiom][3];
    const outDegree = (index.byFirst.get(next) || []).filter((candidate) => !usedSet.has(candidate) && candidate !== idiom).length;
    weight += Math.min(4, outDegree) * 0.3;
    if (safe.includes(idiom)) weight += 1.6;
    return weight;
  });
}

export function chooseChainIdiom({
  requiredChar,
  used = [],
  persona,
  memory,
  coreIndex = CHAIN_CORE_INDEX,
  fullIndex = IDIOM_INDEX,
}) {
  const rng = memory?.rng || createRng(`${requiredChar}-${Date.now()}`);
  const usedSet = chainUsedSet(used);
  const corePick = pickChainFrom(coreIndex, requiredChar, usedSet, persona, rng);
  if (corePick) return corePick;
  const fullPick = pickChainFrom(fullIndex, requiredChar, usedSet, persona, rng);
  return fullPick || null;
}

export function validatedOfflineChainPick({ requiredChar, used, persona, memory, fullIndex = IDIOM_INDEX }) {
  const idiom = chooseChainIdiom({ requiredChar, used, persona, memory, fullIndex });
  if (!idiom) return { ok: false, reason: "no_line", line: "", idiom: "", entry: null };
  const check = validateChainAttempt(idiom, { requiredChar, used, index: fullIndex });
  if (!check.ok) {
    return { ok: false, reason: check.reason, line: check.line || "", idiom: "", entry: null, message: check.message };
  }
  return {
    ok: true,
    idiom: check.line,
    line: check.line,
    verified: check.verified,
    entry: check.entry,
    nextChar: check.nextChar,
    latencyMs: 0,
  };
}

function chainStats(turns, side) {
  const own = turns.filter((turn) => turn.side === side);
  const verified = own.filter((turn) => turn.verified);
  const pending = own.length - verified.length;
  const firsts = new Set(own.map((turn) => [...turn.line][0]));
  const lasts = new Set(own.map((turn) => [...turn.line][3]));
  const chars = new Set(own.flatMap((turn) => [...turn.line]));
  const avgLatency = own.length ? own.reduce((sum, turn) => sum + (turn.latencyMs || 0), 0) / own.length : 0;
  return {
    lines: own.length,
    verified: verified.length,
    pending,
    firsts,
    lasts,
    chars,
    avgLatency,
    verifiedRatio: own.length ? verified.length / own.length : 0,
  };
}

function chainScores(stats, rng) {
  const accuracy = clamp(30 - (stats.lines ? (stats.pending / stats.lines) * 5 : 18), 12, 30);
  const continuity = clamp(
    20 + stats.verifiedRatio * 4 + Math.min(3, stats.lasts.size * 0.5) + (stats.lines ? 0.6 : 0) + rng() * 1.2,
    14,
    25
  );
  const breadth = clamp(
    16 + Math.min(5, stats.firsts.size * 0.65) + Math.min(3, stats.chars.size / 9) + stats.verifiedRatio * 3 + rng() * 1.5,
    12,
    25
  );
  const wit = clamp(20 - Math.max(0, stats.avgLatency / 1000 - 2.5) * 0.6 + rng() * 1.2, 8, 20);
  return {
    accuracy: round1(accuracy),
    continuity: round1(continuity),
    breadth: round1(breadth),
    wit: round1(wit),
  };
}

export function judgeChainOffline({ startChar, fighters, turns, forfeit, seed }) {
  const rng = createRng(seed || `${startChar}-${turns.length}-${Date.now()}`);
  const statsA = chainStats(turns, "A");
  const statsB = chainStats(turns, "B");
  const A = chainScores(statsA, rng);
  const B = chainScores(statsB, rng);

  if (forfeit) {
    if (forfeit.side === "A") A.accuracy = Math.min(A.accuracy, 9);
    else B.accuracy = Math.min(B.accuracy, 9);
  }

  const totalA = round1(scoreTotal(A, IDIOM_RUBRIC));
  const totalB = round1(scoreTotal(B, IDIOM_RUBRIC));
  let winner;
  if (forfeit) {
    winner = forfeit.side === "A" ? "B" : "A";
  } else if (totalA === totalB) {
    if (statsA.verified !== statsB.verified) winner = statsA.verified > statsB.verified ? "A" : "B";
    else if (statsA.firsts.size !== statsB.firsts.size) winner = statsA.firsts.size > statsB.firsts.size ? "A" : "B";
    else winner = "draw";
  } else {
    winner = totalA > totalB ? "A" : "B";
  }

  const winnerSide = winner === "draw" ? (totalA >= totalB ? "A" : "B") : winner;
  const loserSide = winnerSide === "A" ? "B" : "A";
  const winnerName = fighters[winnerSide].name;
  const loserName = fighters[loserSide].name;
  const winnerTurns = turns.filter((turn) => turn.side === winnerSide);
  const verifiedTurns = winnerTurns.filter((turn) => turn.verified);
  const bestTurn = verifiedTurns.length ? verifiedTurns[Math.floor(rng() * verifiedTurns.length)] : winnerTurns[0] || turns[0];
  const bestLine = bestTurn?.line || "";
  const winnerStats = winnerSide === "A" ? statsA : statsB;
  const loserStats = loserSide === "A" ? statsA : statsB;
  const margin = Math.abs(totalA - totalB);
  const bestClause = bestLine ? `最佳一接是「${bestLine}」。` : "";

  const weakness =
    loserStats.verifiedRatio + 0.1 < winnerStats.verifiedRatio
      ? "典故命中"
      : loserStats.firsts.size + 1 < winnerStats.firsts.size
        ? "取词路数"
        : loserStats.avgLatency > winnerStats.avgLatency + 800
          ? "沉吟的速度"
          : "临门一接";

  let commentary;
  if (forfeit) {
    commentary = `${loserName}在「${forfeit.requiredChar}」前接不上了：${forfeit.message}。按规定，本局由${winnerName}收席。${winnerName}共接 ${winnerStats.lines} 回${bestLine ? `，${bestClause}` : ""}席散，字仍在。`;
  } else if (winner === "draw") {
    commentary = `以「${startChar}」起字，${turns.length} 回收席，双方判分只在毫厘之间，本局和。${bestClause}一边胜在取词路数，一边胜在典故命中。酒未尽，席已散。`;
  } else {
    commentary = `以「${startChar}」起字，${turns.length} 回收席，${winnerName}${margin < 1.5 ? "险胜" : "占先"}。${bestClause}${loserName}接得也不弱，但在${weakness}上略逊半筹。酒未尽，席已散。`;
  }

  return {
    winner,
    scores: { A, B },
    totals: { A: round1(scoreTotal(A, IDIOM_RUBRIC)), B: round1(scoreTotal(B, IDIOM_RUBRIC)) },
    commentary,
    highlights: [
      `${winnerName}：库中命中 ${winnerSide === "A" ? statsA.verified : statsB.verified} 回`,
      `${loserName}：库中命中 ${loserSide === "A" ? statsA.verified : statsB.verified} 回`,
    ],
    bestLine,
    engine: "local",
    startChar,
  };
}
