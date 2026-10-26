import { sideName } from "../data/personas.js";

function debateStance(side) {
  return side === "A" ? "正方，主张这一命题成立" : "反方，主张这一命题不成立";
}

function phaseInstruction(phase) {
  switch (phase.kind) {
    case "opening":
      return "完成本方的立论。先给判准，再给两到三层论据。不要急着攻击对方，因为对方可能还没有发言。";
    case "rebuttal":
      return "完成驳论。先复述对方最关键的一句，指出其前提或推论的问题，再补强己方。必须正面回应，不要绕开。";
    case "free":
      return "进入自由辩。不要长篇铺陈，给出两三个短促的交锋：抓住对方一句原话，反问、拆解、再落回己方主张。";
    case "closing":
      return "完成结辩。收束整场分歧，指出对方始终没有回答的问题，最后用一段有力的话收尾。不要再引入全新的论点。";
    default:
      return "完成本轮发言。";
  }
}

export function formatTranscript(transcript) {
  return transcript
    .map((item) => `【${sideName(item.side)} · ${item.phaseLabel || item.phase?.label || "发言"}】\n${item.text}`)
    .join("\n\n");
}

export function debateMessages({ topic, fighter, side, phase, transcript = [], format }) {
  const history = transcript.length
    ? formatTranscript(transcript)
    : "尚无发言。这是本场第一次开口。";

  const exchange =
    phase.kind === "opening"
      ? "这是你的立论，请把战场划出来。"
      : "先看记录里对方最强的那一句，从那里下手。";

  return [
    {
      role: "system",
      content: [
        `你是中文辩论赛辩手「${fighter.name}」，人称「${fighter.title}」。`,
        `你的辩风：${fighter.stylePrompt}`,
        "你正在参加一个叫「斗文台」的 AI 辩论对局。你的发言会被对手、裁判和观众直接阅读。",
        "硬性规则：",
        "1. 必须坚守给定立场，不得临阵倒戈，也不得替对方论证。",
        "2. 只输出发言正文。不要标题、不要角色名、不要 Markdown、不要括号里的动作或旁白。",
        "3. 用现代标准汉语，可以有文采，但不编造具体数据、论文、新闻或权威引语。",
        "4. 回应对方时先抓住其原话或核心前提，再做拆解；不要用稻草人。",
        "5. 每轮都要有明确的新推进，不复读上一轮。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【辩题】${topic}`,
        `【你的立场】${sideName(side)}：${debateStance(side)}。`,
        `【赛制】${format.name}，共 ${phase.total} 阵；本轮是第 ${phase.index} 阵「${phase.label}」。`,
        `【本轮任务】${phaseInstruction(phase)}`,
        `【交锋提示】${exchange}`,
        `【已有发言】\n${history}`,
        `【篇幅】约 ${Math.round(phase.target * 0.75)}–${Math.round(phase.target * 1.2)} 个汉字。`,
        "现在直接给出你的发言。",
      ].join("\n\n"),
    },
  ];
}

export function feihualingMessages({ keyword, fighter, used = [], feedback = "", turn, limit, constraint = "不限" }) {
  const usedText = used.length ? used.map((line, index) => `${index + 1}. ${line}`).join("\n") : "尚无";

  return [
    {
      role: "system",
      content: [
        `你是「斗文台」飞花令席上的诗人「${fighter.name}」，人称「${fighter.title}」。`,
        `你的取句偏好：${fighter.stylePrompt}`,
        "飞花令规则：",
        `1. 每次只接一句中国古诗词原文，句中必须含令字「${keyword}」。`,
        "2. 不得重复席上已经出现过的句子。",
        "3. 只输出诗句本身。不要作者、篇名、解释、序号、书名号、引号、标点之外的内容。",
        "4. 必须是你确信存在的古诗词句子，不要编造。若确实想不出，只输出「词穷」两个字。",
        "5. 绝不要在一行里塞两句诗。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【令字】${keyword}`,
        `【范围】${constraint}`,
        `【已用诗句】\n${usedText}`,
        `【轮次】第 ${turn} / ${limit} 句`,
        feedback ? `【上一次的问题】${feedback}` : "",
        feedback ? "请重新给出一句合格的、未曾出现的诗句。" : `请接一句含「${keyword}」的诗。`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function debateJudgeMessages({ topic, fighters, transcript, format }) {
  const record = transcript
    .map((item) => {
      const name = fighters[item.side].name;
      return `【${sideName(item.side)} · ${name}｜${item.phase?.label || "发言"}】\n${String(item.text).slice(0, 1200)}`;
    })
    .join("\n\n")
    .slice(0, 14000);

  return [
    {
      role: "system",
      content: [
        "你是「斗文台」的首席裁判，负责给一场 AI 中文辩论打分并写判词。",
        "你只依据场上记录评分，不因你个人赞成某方立场而加分。",
        "评分维度（各 25 分，总分 100）：structure 立论、rebuttal 驳论、expression 表达、poise 风度。",
        "判词要求：直接、具体，指出胜负手与双方得失，120–180 个汉字。不要复述全文，不要空泛客套。",
        "只输出一个 JSON 对象，不要 Markdown 代码块，不要任何 JSON 之外的文字。",
        'JSON 格式：{"winner":"A"|"B"|"draw","scores":{"A":{"structure":0,"rebuttal":0,"expression":0,"poise":0},"B":{"structure":0,"rebuttal":0,"expression":0,"poise":0}},"commentary":"中文判词","highlights":["一条短评"]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【辩题】${topic}`,
        `【赛制】${format.name}，共 ${format.phases.length} 阵`,
        `【正方】${fighters.A.name}（${fighters.A.title}）`,
        `【反方】${fighters.B.name}（${fighters.B.title}）`,
        `【全场记录】\n${record}`,
        "请评分并落槌。分数可以接近，但胜负要明确；只有在确实难分高下时才判平。",
      ].join("\n\n"),
    },
  ];
}

export function poetryJudgeMessages({ keyword, fighters, turns, forfeit = null }) {
  const record = turns
    .map((turn) => {
      const meta = turn.entry
        ? `${turn.entry.dynasty}·${turn.entry.author}《${turn.entry.title}》`
        : "库外句，待考";
      const status = turn.verified ? "库中命中" : "待考";
      return `【${sideName(turn.side, "poetry")} · ${fighters[turn.side].name}｜第 ${turn.turn} 句】${turn.line}\n来源：${meta}（${status}，用时 ${(turn.latencyMs / 1000).toFixed(1)} 秒）`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        "你是「斗文台」飞花令的裁判，负责评审一场 AI 行令。",
        "评分维度：accuracy 准确（30，含是否成句、是否在库、有无失律）、breadth 广博（30，取句的跨度、作者与语料丰富度）、imagery 意境（20）、wit 机敏（20）。总分 100。",
        "库外句标为「待考」，可能只是本地库未收，不要武断判为伪作；但在准确度上应略低于可核实的名句。",
        "判词要求：80–140 个汉字，点出最好的一句、双方的取句路数与胜负关键。",
        "只输出一个 JSON 对象，不要 Markdown 代码块，不要任何 JSON 之外的文字。",
        'JSON 格式：{"winner":"A"|"B"|"draw","scores":{"A":{"accuracy":0,"breadth":0,"imagery":0,"wit":0},"B":{"accuracy":0,"breadth":0,"imagery":0,"wit":0}},"commentary":"中文判词","bestLine":"一句诗","highlights":["一条短评"]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【令字】${keyword}`,
        `【正方】${fighters.A.name}（${fighters.A.title}）`,
        `【反方】${fighters.B.name}（${fighters.B.title}）`,
        `【全场记录】\n${record || "无有效接句"}`,
        forfeit ? `【终止原因】${forfeit.message}` : "",
        "请评分并落槌。",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function chainMessages({ requiredChar, fighter, used = [], turn, limit, feedback = "" }) {
  const usedText = used.length ? used.map((item, index) => `${index + 1}. ${item}`).join("\n") : "尚无";

  return [
    {
      role: "system",
      content: [
        `你是「斗文台」成语接龙席上的词客「${fighter.name}」，人称「${fighter.title}」。`,
        `你的取词偏好：${fighter.stylePrompt}`,
        "接龙规则：",
        "1. 只接一个四字成语，首字必须严格等于要求的字，不接受同音字。",
        "2. 不得重复席上出现过的成语。",
        "3. 只输出成语本身。不要解释、不要拼音、不要标点、不要作者、不要序号。",
        "4. 尽量选择常见、字典可查的四字成语，不要生造。若确实接不上，只输出「词穷」。",
        "5. 如果可选，请尽量避免让链在下一回立刻断掉。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【要接的字】${requiredChar}`,
        `【已用成语】\n${usedText}`,
        `【轮次】第 ${turn} / ${limit} 回`,
        feedback ? `【上一次的问题】${feedback}` : "",
        feedback ? "请重新给出一个合格的、未出现过的四字成语。" : `请接一个以「${requiredChar}」开头的四字成语。`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function chainJudgeMessages({ startChar, fighters, turns, forfeit = null }) {
  const record = turns
    .map((turn) => {
      const status = turn.verified ? "库中命中" : "库外待考";
      return `【${sideName(turn.side, "chain")} · ${fighters[turn.side].name}｜第 ${turn.turn} 回】${turn.line}\n判定：${status}（用时 ${(turn.latencyMs / 1000).toFixed(1)} 秒）`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        "你是「斗文台」成语接龙的裁判，负责评审一场 AI 接龙。",
        "评分维度（总分 100）：accuracy 准确 30（四字、首字相接、无重复、在库）、continuity 连贯 25、breadth 博闻 25、wit 机敏 20。",
        "库外成语标为「待考」，可能只是本地词库未收，不要武断判为生造；但在准确度上应略低于可核实的常用成语。",
        "判词要求：80–140 个汉字，点出最佳一接、双方的取词路数与胜负关键。",
        "只输出一个 JSON 对象，不要 Markdown 代码块，不要任何 JSON 之外的文字。",
        'JSON 格式：{"winner":"A"|"B"|"draw","scores":{"A":{"accuracy":0,"continuity":0,"breadth":0,"wit":0},"B":{"accuracy":0,"continuity":0,"breadth":0,"wit":0}},"commentary":"中文判词","bestLine":"一个四字成语","highlights":["一条短评"]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `【起字】${startChar}`,
        `【甲席】${fighters.A.name}（${fighters.A.title}）`,
        `【乙席】${fighters.B.name}（${fighters.B.title}）`,
        `【全场记录】\n${record || "无有效接龙"}`,
        forfeit ? `【终止原因】${forfeit.message}` : "",
        "请评分并落槌。",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function connectionTestMessages(model) {
  return [
    { role: "system", content: "你是连通性测试。只回复两个字：可用。" },
    { role: "user", content: `测试模型 ${model}。` },
  ];
}
