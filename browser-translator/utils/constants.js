const BT_ATTR = 'data-bt-translated';
const BT_ORIGINAL_ATTR = 'data-bt-original';
const BT_PLACEHOLDER_ATTR = 'data-bt-placeholder';
const BT_TITLE_ATTR = 'data-bt-title';
const BT_ALT_ATTR = 'data-bt-alt';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA',
  'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR'
]);

const MIN_TEXT_LENGTH = 2;

const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: 'zh-CN',
  sourceLang: 'auto',
  engine: 'google',
  excludedSites: [],
  engines: {
    google: { apiKey: '', enabled: true },
    deepl: { apiKey: '', enabled: false },
    baidu: { appId: '', secretKey: '', enabled: false },
    custom: { url: '', apiKey: '', enabled: false }
  }
};

const LANGUAGES = {
  'auto': '自动检测',
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁体）',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'de': '德语',
  'es': '西班牙语',
  'ru': '俄语',
  'pt': '葡萄牙语',
  'it': '意大利语',
  'ar': '阿拉伯语',
  'th': '泰语',
  'vi': '越南语'
};
