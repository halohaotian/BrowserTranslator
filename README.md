# Browser Translator

A Chrome extension that translates web pages by replacing text in-place without breaking page interactivity.

一个 Chrome 浏览器翻译扩展，将网页文字直接替换为翻译后的语言，不破坏页面交互。

---

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## Features

- **Instant Page Translation** — Automatically translates page content into the target language by replacing original text in-place
- **Dynamic Content Support** — Uses MutationObserver and periodic scanning to translate dynamically loaded content
- **Multiple Translation Engines** — Supports Google, DeepL, Baidu, and custom engines
- **Multi-language** — Supports 15 languages including Chinese, English, Japanese, Korean, French, German, and more
- **Translation Cache** — Built-in LRU cache in the Service Worker to avoid redundant API calls

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + T` | Toggle translation on/off |
| `Alt + S` | Start translation |
| `Alt + R` | Restore original text |

Shortcuts work on any web page at any time. You can also toggle translation via the extension icon popup.

## Installation

### Load from Source (Developer Mode)

1. Clone the repository
   ```bash
   git clone https://github.com/halohaotian/BrowserTranslator.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** in the top right corner
4. Click **Load unpacked** and select the `browser-translator` directory

### CLI Debug Mode

Launch Chrome with the translation script injected automatically, useful for development:

```bash
npm install
node start-translator.mjs [url]
```

Configurable at the top of the script:

```js
const TARGET_LANG = 'zh-CN';   // Target language
const PROXY = '';               // Proxy address, e.g. 'http://127.0.0.1:7890'
const START_URL = 'https://en.wikipedia.org/wiki/Translation';
```

## Project Structure

```
browser-translator/
├── manifest.json                  # Extension manifest
├── background/
│   └── service-worker.js          # Background service (messaging, translation dispatch, cache)
├── content/
│   ├── content.js                 # Content script (main translation logic)
│   ├── content.css                # Progress overlay styles
│   ├── dom-translator.js          # DOM translation
│   └── text-finder.js             # Text node finder
├── engines/
│   ├── engine-interface.js        # Engine base class
│   ├── google-engine.js           # Google Translate
│   ├── deepl-engine.js            # DeepL Translate
│   ├── baidu-engine.js            # Baidu Translate
│   └── custom-engine.js           # Custom engine
├── popup/
│   ├── popup.html / .css / .js   # Popup UI
├── options/
│   ├── options.html / .css / .js  # Settings page
├── utils/
│   ├── constants.js               # Constants and default settings
│   └── storage.js                 # Storage utilities
└── icons/                         # Extension icons
```

## Configuration

Click the extension icon to open the popup and configure:

- **Translation Toggle** — Enable or disable translation
- **Target Language** — Select the translation target language
- **Translation Engine** — Choose the translation service

Click **Advanced Settings** at the bottom of the popup to access the full settings page for configuring API keys for each engine.

## Technical Notes

- Built on Manifest V3
- Translation requests are dispatched by the Service Worker with caching and batching
- Content scripts use `MutationObserver` to handle SPA and dynamic pages
- Fallback periodic scan (5-second interval) ensures no nodes are missed
- Original text is preserved after translation and can be restored at any time

---

<a id="中文"></a>

## 功能

- **页面即时翻译** — 自动将网页内容翻译为目标语言，直接替换原文
- **动态内容支持** — 通过 MutationObserver 和定时扫描，自动翻译动态加载的内容
- **多翻译引擎** — 支持 Google、DeepL、百度翻译及自定义引擎
- **多语言** — 支持中文、英语、日语、韩语、法语、德语等 15 种语言
- **翻译缓存** — 后台 Service Worker 内置 LRU 缓存，避免重复翻译

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + T` | 切换翻译开关 |
| `Alt + S` | 开始翻译 |
| `Alt + R` | 还原原文 |

快捷键在任意网页上随时可用。也可以通过点击扩展图标弹出窗口来切换翻译。

## 安装

### 从源码加载（开发模式）

1. 克隆仓库
   ```bash
   git clone https://github.com/halohaotian/BrowserTranslator.git
   ```
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择 `browser-translator` 目录

### 命令行调试模式

通过 Node.js 脚本启动 Chrome 并自动注入翻译脚本，适合开发调试：

```bash
npm install
node start-translator.mjs [url]
```

脚本顶部可配置：

```js
const TARGET_LANG = 'zh-CN';   // 目标语言
const PROXY = '';               // 代理地址，如 'http://127.0.0.1:7890'
const START_URL = 'https://en.wikipedia.org/wiki/Translation';
```

## 项目结构

```
browser-translator/
├── manifest.json                  # 扩展清单
├── background/
│   └── service-worker.js          # 后台服务（消息处理、翻译调度、缓存）
├── content/
│   ├── content.js                 # 内容脚本（页面翻译主逻辑）
│   ├── content.css                # 翻译浮层样式
│   ├── dom-translator.js          # DOM 翻译
│   └── text-finder.js             # 文本节点查找
├── engines/
│   ├── engine-interface.js        # 引擎基类
│   ├── google-engine.js           # Google 翻译
│   ├── deepl-engine.js            # DeepL 翻译
│   ├── baidu-engine.js            # 百度翻译
│   └── custom-engine.js           # 自定义引擎
├── popup/
│   ├── popup.html / .css / .js   # 弹出窗口 UI
├── options/
│   ├── options.html / .css / .js  # 设置页面
├── utils/
│   ├── constants.js               # 常量与默认配置
│   └── storage.js                 # 存储工具
└── icons/                         # 扩展图标
```

## 配置

点击扩展图标打开弹出窗口，可配置：

- **翻译开关** — 启用/禁用翻译
- **目标语言** — 翻译目标语言
- **翻译引擎** — 选择使用的翻译服务

也可点击弹出窗口底部的「高级设置」进入完整的设置页面，配置各引擎的 API Key 等参数。

## 技术说明

- 基于 Manifest V3 构建
- 翻译请求由 Service Worker 统一调度，支持缓存和批量处理
- 内容脚本通过 `MutationObserver` 监听 DOM 变化，处理 SPA 等动态页面
- 备用定时扫描（5 秒间隔）确保不遗漏未翻译节点
- 翻译后保留原文数据，可随时还原

## License

[MIT](LICENSE)
