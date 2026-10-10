// Small "for fun" features layered over the scene: a discovery album, fortune slips,
// a breathing guide and snapshots. All of them are DOM overlays wired up from main.js.
import { smooth } from './util.js';

const $ = (id) => document.getElementById(id);
const FOUND_KEY = 'zen-garden:found';
const SAND_ENTRY = ['白砂', '点击投下石子，按住拖动耙出砂纹'];

function loadFound() {
  try { return new Set(JSON.parse(localStorage.getItem(FOUND_KEY)) ?? []); } catch { return new Set(); }
}
function saveFound(found) {
  try { localStorage.setItem(FOUND_KEY, JSON.stringify([...found])); } catch { /* storage blocked: keep it for this session only */ }
}

// 图鉴: every clickable thing in the garden (plus the sand) is an entry, keyed by display name.
export function createAlbum(ctx) {
  const found = loadFound();
  const entries = new Map([SAND_ENTRY]);
  for (const o of ctx.interactives) {
    const { name, hint } = o.userData.interactive;
    if (!entries.has(name)) entries.set(name, hint);
  }
  const total = entries.size;
  const count = () => [...entries.keys()].filter((n) => found.has(n)).length;
  const btn = $('btn-album'), list = $('album-list'), root = $('album');
  const isOpen = () => root.classList.contains('show');

  function render() {
    const n = count();
    btn.textContent = n === total ? '📜 图鉴 ✓' : `📜 图鉴 ${n}/${total}`;
    $('album-count').textContent = `${n} / ${total}`;
    $('album-bar').style.width = `${(n / total) * 100}%`;
    list.replaceChildren(...[...entries].map(([name, hint]) => {
      const got = found.has(name);
      const li = document.createElement('li');
      li.className = got ? 'got' : '';
      const b = document.createElement('b');
      b.textContent = got ? name : '？？？';
      const s = document.createElement('small');
      s.textContent = hint;
      li.append(b, s);
      return li;
    }));
  }
  function open() { render(); root.classList.add('show'); }
  function close() { root.classList.remove('show'); }
  function discover(name) {
    if (!entries.has(name) || found.has(name)) return;
    found.add(name);
    saveFound(found);
    render();
    btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
    if (count() === total) ctx.toast('图鉴集齐 · 你已是这座庭院的禅者');
  }
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) close();
  });
  render();
  return { discover, open, close, isOpen, toggle: () => (isOpen() ? close() : open()) };
}

// 禅签: a vertical paper slip with a random verse, reshuffled on each draw.
const FORTUNES = [
  ['大吉', '一期一会此刻即是全部', '静坐 赏花', '急于求成'],
  ['大吉', '砂纹随心风过即平', '耙砂 散步', '执着于形'],
  ['大吉', '龙吟九霄珠在掌中', '追珠 欢笑', '独自忧愁'],
  ['中吉', '枯山无水水在心中', '观石 品茶', '强求结果'],
  ['中吉', '落花有意流水无情', '放下 远行', '回望太久'],
  ['中吉', '一滴落水满池涟漪', '投石 许愿', '多虑'],
  ['小吉', '慢一步看见的更多', '漫步 读书', '赶路'],
  ['小吉', '石不言自有其重', '摆石 守约', '轻许诺言'],
  ['小吉', '猫在墙头观天下事', '晒太阳 发呆', '熬夜'],
  ['吉', '松树千年不争一春', '修剪 养花', '比较'],
  ['吉', '耙过的砂留给下一个人', '分享 留痕', '独占'],
  ['末吉', '不急于成且待花开', '等待 写字', '预支将来'],
];
const SEASON_NOTE = {
  spring: '樱开时宜赏花',
  summer: '雨声里宜静听',
  autumn: '红叶正当时',
  winter: '雪压枝头慢慢走',
};
const LEVEL_CLASS = { 大吉: '', 中吉: 'mid', 小吉: 'soft', 吉: 'soft', 末吉: 'soft' };

export function createFortune(ctx) {
  const root = $('fortune'), slip = $('fortune-slip');
  let last = -1;
  function draw() {
    let i;
    do { i = Math.floor(Math.random() * FORTUNES.length); } while (i === last && FORTUNES.length > 1);
    last = i;
    const [level, verse, yi, ji] = FORTUNES[i];
    $('fortune-level').textContent = level;
    $('fortune-level').className = `slip-level ${LEVEL_CLASS[level]}`;
    $('fortune-verse').textContent = verse;
    $('fortune-yi').textContent = `宜 ${yi}\n忌 ${ji}`;
    $('fortune-note').textContent = SEASON_NOTE[ctx.season.id];
    slip.classList.remove('again'); void slip.offsetWidth; slip.classList.add('again');
    root.classList.add('show');
    ctx.sfx.chime();
  }
  function close() { root.classList.remove('show'); }
  $('fortune-again').addEventListener('click', draw);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) close();
  });
  return { draw, close, isOpen: () => root.classList.contains('show') };
}

// 调息: a 4-4-4-4 box-breathing guide. The ring is driven from the frame loop, so it stays
// in step with the rest of the scene and pauses along with it.
const BREATH_NAMES = ['吸', '停', '呼', '停'];
const BREATH_TONES = [392, 330, 294, 262];

export function createBreath(ctx) {
  const root = $('breath'), ring = $('breath-ring'), label = $('breath-label');
  let on = false, t = 0, phase = -1;
  function set(v) {
    on = v; t = 0; phase = -1;
    root.classList.toggle('show', v);
  }
  function update(dt) {
    if (!on) return;
    t += dt;
    const cycle = t % 16; // 4 s in, 4 s hold, 4 s out, 4 s hold
    const p = Math.floor(cycle / 4);
    const k = smooth((cycle % 4) / 4);
    const s = p === 0 ? k : p === 1 ? 1 : p === 2 ? 1 - k : 0;
    ring.style.transform = `scale(${(0.55 + 0.45 * s).toFixed(3)})`;
    if (p !== phase) {
      phase = p;
      label.textContent = BREATH_NAMES[p];
      ctx.sfx.tone(BREATH_TONES[p], 1.2, { gain: 0.035, attack: 0.3 });
    }
  }
  return {
    toggle() { set(!on); return on; },
    close() { if (on) set(false); },
    update,
    get isOn() { return on; },
  };
}

// 拍照: must be called right after renderer.render() in the same frame, while the drawing
// buffer still holds the picture. Saves the canvas only; overlays are DOM and not included.
export function savePhoto(ctx, canvas) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `zen-garden-${ctx.season.id}-${stamp}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  const sh = $('shutter');
  sh.classList.remove('go'); void sh.offsetWidth; sh.classList.add('go');
  ctx.sfx.noise(0.06, { gain: 0.3, freq: 3500, q: 0.6, type: 'highpass' });
  ctx.toast('已存下这一刻');
}
