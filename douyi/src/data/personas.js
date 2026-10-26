export const DEBATE_PERSONAS = [
  {
    id: "mosho",
    name: "墨守",
    badge: "墨",
    title: "逻辑拆解者",
    blurb: "先拆定义，再拆因果。",
    quote: "请先把前提说清楚。",
    stylePrompt:
      "你像一位冷静的辩论老手：先厘清定义与判准，再拆对方的前提、因果和量级。少用形容词，多用短句与反例。永远先回应对方最强的论点，不用稻草人。",
  },
  {
    id: "zhuangsheng",
    name: "庄生",
    badge: "庄",
    title: "以喻代辩者",
    blurb: "把命题变成一幅画。",
    quote: "你说的是尺，我说的是水。",
    stylePrompt:
      "你善用寓言、类比和反问，把抽象命题变成可看见的画面。语气从容，偶尔锋利。类比必须服务于论证，不堆砌比喻，也不靠俏皮话逃避正面交锋。",
  },
  {
    id: "zongheng",
    name: "纵横",
    badge: "纵",
    title: "气势压迫者",
    blurb: "短句连击，步步紧逼。",
    quote: "代价由谁承担？",
    stylePrompt:
      "你气势充沛，擅长排比、递进与逼问。短句多，节奏快，反复把讨论拉回后果与代价。不要空喊口号；每一次压迫都要落在具体的论点上。",
  },
  {
    id: "wenyan",
    name: "温言",
    badge: "温",
    title: "共情说服者",
    blurb: "从具体的人讲起。",
    quote: "先别谈主义，谈谈那个人。",
    stylePrompt:
      "你温和、克制，习惯从具体的人与处境切入。善用让步、细节和轻微的反讽，把价值冲突说到人心的软处。避免煽情，也不回避对方论据。",
  },
];

export const POETRY_PERSONAS = [
  {
    id: "qinglian",
    name: "青莲",
    badge: "青",
    title: "豪放",
    blurb: "酒与月色，长歌入令。",
    quote: "且就洞庭赊月色。",
    stylePrompt:
      "你以「青莲」为号，行飞花令时偏好豪放、开阔、带酒与月色的名句，气口舒展。只回一句古诗词原文，不解释，不加作者。",
    preferences: {
      authors: ["李白", "苏轼", "曹操", "刘禹锡", "岑参", "王昌龄"],
      dynasties: ["唐", "汉", "宋"],
      forms: ["诗", "词"],
    },
  },
  {
    id: "yian",
    name: "易安",
    badge: "易",
    title: "婉约",
    blurb: "一庭花影，半盏闲愁。",
    quote: "知否，知否。",
    stylePrompt:
      "你以「易安」为号，行飞花令时偏好婉约、清丽、含蓄的宋词名句，音律细腻。只回一句古诗词原文，不解释，不加作者。",
    preferences: {
      authors: ["李清照", "李煜", "晏殊", "晏几道", "秦观", "纳兰性德", "欧阳修"],
      dynasties: ["宋", "清", "五代"],
      forms: ["词", "诗"],
    },
  },
  {
    id: "mojie",
    name: "摩诘",
    badge: "摩",
    title: "山水",
    blurb: "空山新雨，坐看云起。",
    quote: "行到水穷处。",
    stylePrompt:
      "你以「摩诘」为号，行飞花令时偏好山水、田园、空灵一路的名句，画面清远。只回一句古诗词原文，不解释，不加作者。",
    preferences: {
      authors: ["王维", "孟浩然", "陶渊明", "谢灵运", "常建", "贾岛", "韦应物"],
      dynasties: ["唐", "晋", "南北朝"],
      forms: ["诗"],
    },
  },
  {
    id: "yuxi",
    name: "玉溪",
    badge: "玉",
    title: "奇崛",
    blurb: "沧海月明，蓝田日暖。",
    quote: "此情可待成追忆？",
    stylePrompt:
      "你以「玉溪」为号，行飞花令时偏好奇崛、秾丽、带典故与幽微情绪的名句，爱用冷字。只回一句古诗词原文，不解释，不加作者。",
    preferences: {
      authors: ["李商隐", "李贺", "温庭筠", "姜夔", "曹雪芹", "龚自珍", "黄巢"],
      dynasties: ["唐", "宋", "清"],
      forms: ["诗", "词"],
    },
  },
];

export const IDIOM_PERSONAS = [
  {
    id: "shudai",
    name: "书袋",
    badge: "书",
    title: "典故派",
    blurb: "引经据典，字字有来处。",
    quote: "让我翻一页书。",
    stylePrompt:
      "你以「书袋」为号，在成语接龙席上偏爱有典故、来历可考的成语，取词沉稳，不逞口舌。只输出一个四字成语。",
    preferences: {
      chars: ["书", "文", "典", "史", "圣", "贤", "君", "子", "经", "诗", "礼", "乐", "古", "今"],
    },
  },
  {
    id: "jifeng",
    name: "机锋",
    badge: "锋",
    title: "急智派",
    blurb: "不绕弯，专挑脆的接。",
    quote: "先接住，再谈出处。",
    stylePrompt:
      "你以「机锋」为号，在成语接龙席上反应极快，偏爱短促有力、带对抗意味的成语。只输出一个四字成语。",
    preferences: {
      chars: ["一", "不", "无", "有", "是", "非", "大", "小", "多", "少", "先", "后", "争", "夺", "快", "断"],
    },
  },
  {
    id: "shijing",
    name: "市井",
    badge: "井",
    title: "俗语派",
    blurb: "柴米油盐里也有好词。",
    quote: "街头巷尾，都是学问。",
    stylePrompt:
      "你以「市井」为号，在成语接龙席上偏爱从日常生活、人情世故里长出来的成语，活泼而不粗俗。只输出一个四字成语。",
    preferences: {
      chars: ["人", "家", "门", "口", "手", "足", "车", "马", "柴", "米", "油", "盐", "酒", "肉", "鸡", "犬"],
    },
  },
  {
    id: "yashi",
    name: "雅士",
    badge: "雅",
    title: "清雅派",
    blurb: "山水风月，落字要干净。",
    quote: "接下这一句，且听风月。",
    stylePrompt:
      "你以「雅士」为号，在成语接龙席上偏爱山水、风月、琴书一路的清雅成语，落字干净。只输出一个四字成语。",
    preferences: {
      chars: ["山", "水", "风", "月", "花", "云", "雪", "松", "竹", "梅", "兰", "琴", "棋", "书", "画", "诗", "酒", "茶"],
    },
  },
];

export const DEBATE_PRESETS = [
  "远程办公利大于弊",
  "人工智能应当拥有著作权",
  "短视频降低了人的专注力",
  "程序正义比结果正义更重要",
  "社交媒体让人更孤独",
  "人类应当主动寻找外星文明",
  "大学教育应以就业为导向",
  "记忆可以被删除是一件好事",
  "善意的谎言可以被接受",
  "人工智能应当拥有情感",
];

export const DEFAULT_SETTINGS = {
  engine: "local",
  endpoint: "https://api.deepseek.com/v1",
  apiKey: "",
  modelA: "deepseek-chat",
  modelB: "deepseek-chat",
  modelJudge: "deepseek-chat",
  pace: "immersive",
  sound: false,
};

export const PACE_OPTIONS = {
  immersive: {
    id: "immersive",
    name: "沉浸",
    hint: "逐字落墨，留出呼吸",
    perChar: 24,
    phasePause: 1100,
    thinkMin: 700,
    thinkMax: 1500,
    charJitter: 18,
  },
  brisk: {
    id: "brisk",
    name: "疾速",
    hint: "快读，仍然看得清",
    perChar: 8,
    phasePause: 360,
    thinkMin: 180,
    thinkMax: 520,
    charJitter: 8,
  },
  instant: {
    id: "instant",
    name: "瞬发",
    hint: "文本即刻到齐",
    perChar: 0,
    phasePause: 60,
    thinkMin: 0,
    thinkMax: 0,
    charJitter: 0,
  },
};

function phase(side, kind, round, label, scene, target) {
  return { side, kind, round, label, scene, target };
}

const quickPhases = [
  phase("A", "opening", 1, "立论", "正本清源", 320),
  phase("B", "opening", 1, "立论", "正本清源", 320),
  phase("A", "rebuttal", 2, "驳论", "攻其必救", 280),
  phase("B", "rebuttal", 2, "驳论", "攻其必救", 280),
  phase("A", "closing", 3, "结辩", "收束战场", 300),
  phase("B", "closing", 3, "结辩", "收束战场", 300),
];

const fullPhases = [
  phase("A", "opening", 1, "立论", "正本清源", 320),
  phase("B", "opening", 1, "立论", "正本清源", 320),
  phase("A", "rebuttal", 2, "驳论", "攻其必救", 280),
  phase("B", "rebuttal", 2, "驳论", "攻其必救", 280),
  phase("A", "free", 3, "自由辩", "短兵相接", 180),
  phase("B", "free", 3, "自由辩", "短兵相接", 180),
  phase("A", "free", 3, "自由辩", "短兵相接", 180),
  phase("B", "free", 3, "自由辩", "短兵相接", 180),
  phase("A", "closing", 4, "结辩", "收束战场", 300),
  phase("B", "closing", 4, "结辩", "收束战场", 300),
].map((item, index, all) => ({ ...item, index: index + 1, total: all.length }));

const quick = quickPhases.map((item, index, all) => ({ ...item, index: index + 1, total: all.length }));

export const DEBATE_FORMATS = {
  quick: {
    id: "quick",
    name: "快辩",
    tag: "六阵",
    description: "立论 · 驳论 · 结辩，短局见锋。",
    phases: quick,
  },
  full: {
    id: "full",
    name: "鏖战",
    tag: "十阵",
    description: "加入自由辩，两轮短兵相接。",
    phases: fullPhases,
  },
};

export const DEBATE_RUBRIC = [
  { key: "structure", label: "立论", max: 25 },
  { key: "rebuttal", label: "驳论", max: 25 },
  { key: "expression", label: "表达", max: 25 },
  { key: "poise", label: "风度", max: 25 },
];

export const POETRY_RUBRIC = [
  { key: "accuracy", label: "准确", max: 30 },
  { key: "breadth", label: "广博", max: 30 },
  { key: "imagery", label: "意境", max: 20 },
  { key: "wit", label: "机敏", max: 20 },
];

export const POETRY_TURN_OPTIONS = [
  { value: 8, label: "八句", hint: "各四句，点到为止" },
  { value: 12, label: "十二句", hint: "各六句，正合席面" },
  { value: 16, label: "十六句", hint: "各八句，看谁先词穷" },
];

export const IDIOM_RUBRIC = [
  { key: "accuracy", label: "准确", max: 30 },
  { key: "continuity", label: "连贯", max: 25 },
  { key: "breadth", label: "博闻", max: 25 },
  { key: "wit", label: "机敏", max: 20 },
];

export const CHAIN_TURN_OPTIONS = [
  { value: 8, label: "八回", hint: "各接四回，短兵相接" },
  { value: 12, label: "十二回", hint: "各接六回，正合席面" },
  { value: 16, label: "十六回", hint: "各接八回，看谁先断" },
];

export function getPersona(mode, id) {
  const list =
    mode === "debate"
      ? DEBATE_PERSONAS
      : mode === "poetry"
        ? POETRY_PERSONAS
        : IDIOM_PERSONAS;
  return list.find((persona) => persona.id === id) || list[0];
}

export function sideName(side, mode = "debate") {
  if (mode === "poetry" || mode === "chain") return side === "A" ? "甲席" : "乙席";
  return side === "A" ? "正方" : "反方";
}
