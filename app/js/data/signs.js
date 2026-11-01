/**
 * 词库
 * ─────────────────────────────────────────────────────────────
 * 与旧版最大的区别：每个词条显式声明"模型认不认识它"。
 *
 *   yoloClass : string | null   —— YOLO 模型里对应的类名（见 models/manifest.json）
 *                                 null = 模型当前不认识，绝不能进 AI 判定题池
 *   trainable : boolean         —— 是否允许在"端侧训练营"里录样本解锁
 *
 * 旧版的 bug 就出在这里：词库列了 17 个词条，却没有任何字段说明
 * "只有数字 6 能被 YOLO 认出来"，游戏随机出题时自然会说出"八"——
 * 而模型只会输出 gesture_6。现在题池由 capability.js 严格按能力生成。
 */

/** 站点资源根目录：由模块自身位置推导，无论站点部署在根路径还是子路径都正确 */
export const ASSET_BASE = new URL('../../assets/', import.meta.url).href;

export const categories = [
  { id: 'numbers', name: '数字手型', icon: '✋', desc: '生活通用数字手型，也是本项目第一个可训练的数据集。' },
  { id: 'greetings', name: '日常问候', icon: '🤝', desc: '从一句「谢谢」开始，让礼貌变成看得见的动作。' },
  { id: 'blessings', name: '祝福表达', icon: '🧧', desc: '节日与活动里的祝福语，适合拍成短视频传播。' },
];

export const signs = [
  {
    id: 'number-6', word: '六', pinyin: 'liù', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true,
    yoloClass: 'gesture_6',
    desc: '拇指与小指伸直，其余三指自然弯曲。',
    tips: ['拇指和小指尽量伸直，两根手指要形成明显的夹角。', '手离镜头 40–60 cm，避免逆光。', '掌心或手背朝向镜头都可以，关键是手指完整入镜。'],
    mistakes: ['中指没有收拢，看起来像比「八」。', '手离镜头太近，指尖出画。'],
    media: [
      { type: 'image', step: 1, src: `${ASSET_BASE}img/example_number_6_a.jpg`, credit: '示范者已授权公开使用', alt: '数字六手型示范' },
    ],
  },
  {
    id: 'number-0', word: '零', pinyin: 'líng', category: 'numbers',
    kind: 'static', difficulty: 2, trainable: true, yoloClass: null,
    desc: '拇指与食指指尖相捏成圆，其余三指自然张开。',
    tips: ['拇指与食指指尖轻轻相碰，留出一个小圆。', '其余三指自然张开，不要紧贴掌心。'],
    mistakes: ['圆捏得太紧，和「三」混淆。'],
    media: [],
  },
  {
    id: 'number-1', word: '一', pinyin: 'yī', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true, yoloClass: null,
    desc: '食指伸直，其余四指弯曲握拳。',
    tips: ['只伸出食指，指向斜上方。', '拇指自然压住弯曲的中指。'],
    mistakes: ['食指没有伸直，被识别成握拳。'],
    media: [],
  },
  {
    id: 'number-2', word: '二', pinyin: 'èr', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true, yoloClass: null,
    desc: '食指与中指伸直分开成 V 形，其余三指弯曲。',
    tips: ['V 形夹角约 30–45°。', '手背朝镜头时两根手指不要重叠。'],
    mistakes: ['两指并拢，看起来像「一」。'],
    media: [],
  },
  {
    id: 'number-3', word: '三', pinyin: 'sān', category: 'numbers',
    kind: 'static', difficulty: 2, trainable: true, yoloClass: null,
    desc: '拇指与食指相捏，中指、无名指、小指伸直。',
    tips: ['三个伸直的手指自然分开。', '掌心朝前，手腕略低于手指。'],
    mistakes: ['三指并拢，和「零」混淆。'],
    media: [],
  },
  {
    id: 'number-4', word: '四', pinyin: 'sì', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true, yoloClass: null,
    desc: '食指、中指、无名指、小指伸直，拇指弯曲贴向掌心。',
    tips: ['四指伸直，拇指收进掌心。', '不要把小指藏在无名指后面。'],
    mistakes: ['拇指没收回，变成「五」。'],
    media: [],
  },
  {
    id: 'number-5', word: '五', pinyin: 'wǔ', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true, yoloClass: null,
    desc: '五指自然张开，掌心向前。',
    tips: ['五指张开到舒服的程度，不要过度用力。', '让整个手掌都在画面内。'],
    mistakes: ['手指弯曲，看起来像「四」。'],
    media: [],
  },
  {
    id: 'number-7', word: '七', pinyin: 'qī', category: 'numbers',
    kind: 'static', difficulty: 2, trainable: true, yoloClass: null,
    desc: '拇指、食指、中指指尖相捏，其余两指弯曲。',
    tips: ['三个指尖轻轻捏在一起，像捏起一粒米。', '手背朝镜头，指尖位置略高于手腕。'],
    mistakes: ['捏合点被手掌挡住。'],
    media: [],
  },
  {
    id: 'number-8', word: '八', pinyin: 'bā', category: 'numbers',
    kind: 'static', difficulty: 1, trainable: true, yoloClass: null,
    desc: '拇指与食指伸直成 L 形，其余三指弯曲。',
    tips: ['拇指与食指形成清晰的 L 形。', '镜像画面会让 L 形方向反过来，按屏幕里的样子比。'],
    mistakes: ['L 形夹角太小，和「七」混淆。'],
    // 暂无已授权的手型照片：改用「关键点模板」自动绘制示意（见 docs/下一阶段规划.md §9）
    media: [],
  },
  {
    id: 'number-9', word: '九', pinyin: 'jiǔ', category: 'numbers',
    kind: 'static', difficulty: 2, trainable: true, yoloClass: null,
    desc: '食指弯曲成钩状，其余四指握拳。',
    tips: ['食指第二关节弯曲，形成一个小钩。', '钩子朝向镜头，避免侧对。'],
    mistakes: ['钩的角度太小，和握拳混淆。'],
    media: [],
  },
  {
    id: 'number-10', word: '十', pinyin: 'shí', category: 'numbers',
    kind: 'static', difficulty: 2, trainable: true, yoloClass: null,
    desc: '五指握拳；也有食指与中指交叉的写法，以社团教学为准。',
    tips: ['握拳时拇指压在外侧，拳心朝镜头。', '保持拳头稳定 1 秒再松开。'],
    mistakes: ['拳心没有朝向镜头。'],
    media: [],
  },
  {
    id: 'thanks', word: '谢谢', pinyin: 'xiè xie', category: 'greetings',
    kind: 'dynamic', difficulty: 1, trainable: false, yoloClass: null,
    desc: '一手伸出拇指，其余四指弯曲，拇指向前弯动两下。',
    tips: ['拇指向前弯动两下，动作轻缓，不要甩手腕。', '配合微笑与点头，表达会更自然。'],
    mistakes: ['只比了静态手型，没有弯动动作。'],
    // 网络来源图解已移除（版权与隐私原因），等待社团自制素材或关键点示意图
    media: [],
  },
  {
    id: 'blessing-666', word: '六六大顺', pinyin: 'liù liù dà shùn', category: 'blessings',
    kind: 'dynamic', difficulty: 2, trainable: false, yoloClass: null,
    desc: '一句常用祝福语，祝愿事事顺利。视频为社团成员示范。',
    tips: ['先比出数字六，再配合向前的动作表达「顺利」。', '动作幅度可以稍大。'],
    mistakes: ['只比了数字六，缺少向前的推进动作。'],
    // 真人示范视频需提供者书面授权后才可入库；未确认前不展示
    media: [],
  },
  {
    id: 'hello', word: '你好', pinyin: 'nǐ hǎo', category: 'greetings',
    kind: 'dynamic', difficulty: 1, trainable: false, yoloClass: null, pending: true,
    desc: '词条筹备中：欢迎社团成员录制标准示范，一起把常用问候补齐。',
    tips: [], mistakes: [], media: [],
  },
  {
    id: 'bye', word: '再见', pinyin: 'zài jiàn', category: 'greetings',
    kind: 'dynamic', difficulty: 1, trainable: false, yoloClass: null, pending: true,
    desc: '词条筹备中：一个挥手的动作，也可以有很多种温暖的表达。',
    tips: [], mistakes: [], media: [],
  },
];

export const signById = Object.fromEntries(signs.map((s) => [s.id, s]));
export const activeSigns = signs.filter((s) => !s.pending);

/** 有示范图/视频、适合做知识类游戏的词条 */
export const illustrated = activeSigns.filter((s) => s.media?.some((m) => m.type === 'image'));

// ─────────────────────────────────────────────────────────────
// 用户自建词条（词工坊）
//
// 自建词条与内置词条享有同等地位：可以进知识类游戏、可以在端侧训练营里
// 练出个人模型后进 AI 判定题池。它们存在 localStorage 的进度里，随备份
// 一起导出/导入，所以换设备不会丢（前提是导出了备份文件）。
// ─────────────────────────────────────────────────────────────

let customSigns = [];

/** 用 localStorage 里的自建词条重建索引（main.js 在 store.load() 之后调用一次） */
export function syncCustomSigns(list = []) {
  customSigns = (list || []).filter((s) => s && s.id && s.word);
  const all = [...signs.filter((s) => !s.pending), ...customSigns];
  activeSigns.length = 0;
  activeSigns.push(...all);
  for (const k of Object.keys(signById)) delete signById[k];
  for (const s of [...signs, ...customSigns]) signById[s.id] = s;
  illustrated.length = 0;
  illustrated.push(...all.filter((s) => s.media?.some((m) => m.type === 'image')));
  return activeSigns.length;
}

export function customSignList() {
  return customSigns;
}

/** 生成一个新词条的骨架；id 用 slug + 时间戳，避免与内置词条撞车 */
export function makeCustomSign({ word, pinyin = '', category = 'custom', kind = 'static', desc = '', tips = [] }) {
  const slug = String(word || '').trim().replace(/\s+/g, '-') || 'sign';
  return {
    id: `custom-${slug}-${Date.now().toString(36)}`,
    word: String(word || '').trim(),
    pinyin,
    category,
    kind,
    difficulty: 2,
    trainable: kind === 'static',
    yoloClass: null, // 自建词条默认不被 YOLO 认识，必须端侧训练后才进 AI 题池
    custom: true,
    desc,
    tips: Array.isArray(tips) ? tips.filter(Boolean) : String(tips || '').split('\n').map((t) => t.trim()).filter(Boolean),
    mistakes: [],
    media: [],
    videos: [], // 预留：未来支持视频示例
  };
}

export function dailySign(date = new Date()) {
  const seed = Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  );
  return activeSigns[seed % activeSigns.length];
}

export function signsByCategory(cat) {
  return activeSigns.filter((s) => !cat || cat === 'all' || s.category === cat);
}

export const badges = [
  { id: 'first', icon: '🌱', name: '初见手语', desc: '完成第一次练习', check: (s) => s.history.length >= 1 },
  { id: 'ten', icon: '🎯', name: '十拿九稳', desc: '累计识别成功 10 次', check: (s) => s.history.filter((h) => h.ok).length >= 10 },
  { id: 'streak3', icon: '🔥', name: '三日不辍', desc: '连续学习 3 天', check: (s) => s.streak >= 3 },
  { id: 'trainer', icon: '🧠', name: '端侧训练师', desc: '训练出第一个个性化模型', check: (s) => (s.trainRuns || 0) >= 1 },
  { id: 'collector', icon: '📷', name: '数据贡献者', desc: '采集并保存第一份样本', check: (s) => (s.captures || 0) >= 1 },
  { id: 'xp300', icon: '⭐', name: '手语之星', desc: '累计获得 300 XP', check: (s) => s.xp >= 300 },
  { id: 'allplay', icon: '🧩', name: '全能玩家', desc: '体验过 4 种游戏', check: (s) => Object.keys(s.games || {}).length >= 4 },
];
