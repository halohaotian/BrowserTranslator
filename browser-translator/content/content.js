(function() {
  'use strict';

  const BT_ATTR = 'data-bt-translated';
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA',
    'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR'
  ]);

  let isEnabled = false;
  let targetLang = 'zh-CN';
  let keywords = [];
  let currentHighlightIndex = 0;
  const originalTexts = new Map();

  // ========== 进度浮层 ==========
  function showProgress(text, type) {
    let el = document.getElementById('bt-progress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bt-progress';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'visible' + (type ? ' ' + type : '');
  }

  function hideProgress() {
    const el = document.getElementById('bt-progress');
    if (el) el.className = '';
  }

  // ========== 关键词高亮 ==========
  function highlightKeywords() {
    // 清除旧高亮
    document.querySelectorAll('[bt-highlight]').forEach(el => {
      el.removeAttribute('bt-highlight');
    });

    if (keywords.length === 0) {
      removeNavButton();
      return;
    }

    let count = 0;
    for (const [node, original] of originalTexts) {
      const translated = node.textContent.toLowerCase();
      const originalLower = original.toLowerCase();
      for (const kw of keywords) {
        if (kw && (originalLower.includes(kw.toLowerCase()) || translated.includes(kw.toLowerCase()))) {
          if (node.parentElement) {
            node.parentElement.setAttribute('bt-highlight', 'true');
            count++;
          }
          break;
        }
      }
    }

    console.log('[BT] 关键词高亮:', count, '个匹配');
    updateNavButton(count);
  }

  // ========== 高亮导航 ==========
  function createNavButton() {
    if (document.getElementById('bt-nav')) return;
    const nav = document.createElement('div');
    nav.id = 'bt-nav';
    nav.innerHTML = `
      <button id="bt-nav-up" title="上一个">&#9650;</button>
      <span id="bt-nav-count">0</span>
      <button id="bt-nav-down" title="下一个">&#9660;</button>
    `;
    document.body.appendChild(nav);
    document.getElementById('bt-nav-up').addEventListener('click', () => scrollToHighlight(-1));
    document.getElementById('bt-nav-down').addEventListener('click', () => scrollToHighlight(1));
  }

  function removeNavButton() {
    const nav = document.getElementById('bt-nav');
    if (nav) nav.remove();
  }

  function updateNavButton(count) {
    if (count === 0) { removeNavButton(); return; }
    createNavButton();
    document.getElementById('bt-nav-count').textContent = count;
    currentHighlightIndex = 0;
  }

  function scrollToHighlight(direction) {
    const highlights = [...document.querySelectorAll('[bt-highlight]')];
    if (highlights.length === 0) return;
    currentHighlightIndex += direction;
    if (currentHighlightIndex < 0) currentHighlightIndex = highlights.length - 1;
    if (currentHighlightIndex >= highlights.length) currentHighlightIndex = 0;
    highlights[currentHighlightIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('bt-nav-count').textContent = `${currentHighlightIndex + 1}/${highlights.length}`;
  }

  // ========== 翻译功能 ==========
  async function translateViaGoogle(text) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const resp = await fetch(url);
      if (!resp.ok) return text;
      const data = await resp.json();
      let result = '';
      if (data && data[0]) {
        for (const p of data[0]) if (p[0]) result += p[0];
      }
      return result || text;
    } catch (e) {
      return text;
    }
  }

  async function translateViaBackground(texts) {
    const resp = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      texts: texts,
      sourceLang: 'auto',
      targetLang: targetLang
    });
    if (resp && resp.error) throw new Error(resp.error);
    if (resp && resp.translations && resp.translations.length === texts.length) {
      return resp.translations;
    }
    throw new Error('Background 翻译响应无效');
  }

  async function translateTexts(texts) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const translations = await translateViaBackground(texts);
        const changed = translations.filter((t, i) => t !== texts[i]).length;
        if (changed > 0) return translations;
      }
    } catch (e) {
      console.warn('[BT] Background 翻译失败，使用直接 API:', e.message);
    }
    return Promise.all(texts.map(t => translateViaGoogle(t)));
  }

  function findTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.hasAttribute(BT_ATTR) || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        if (/^[\d\s\p{P}®©™]+$/u.test(node.textContent.trim())) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function applyTranslations(nodes, originals, translations) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const translated = translations[i];
      if (translated && translated !== originals[i] && node.parentElement) {
        originalTexts.set(node, node.textContent);
        node.textContent = translated;
        node.parentElement.setAttribute(BT_ATTR, 'true');
      }
    }
  }

  async function translatePage() {
    if (isEnabled) return;
    isEnabled = true;
    console.log('[BT] 开始翻译... 目标语言:', targetLang);

    const nodes = findTextNodes(document.body);
    console.log('[BT] 找到', nodes.length, '个文本节点');

    if (nodes.length === 0) {
      console.warn('[BT] 没有找到可翻译的文本节点');
      isEnabled = false;
      return;
    }

    const total = Math.ceil(nodes.length / 5);
    let batchNum = 0;

    showProgress('翻译中... 0/' + nodes.length, '');

    const batchSize = 5;
    for (let i = 0; i < nodes.length; i += batchSize) {
      if (!isEnabled) break;
      batchNum++;
      const batch = nodes.slice(i, i + batchSize);
      const originals = batch.map(n => n.textContent.trim());
      const translations = await translateTexts(originals);
      applyTranslations(batch, originals, translations);

      if (i + batchSize < nodes.length) {
        showProgress('翻译中... ' + (i + batchSize) + '/' + nodes.length, '');
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const count = document.querySelectorAll('[' + BT_ATTR + ']').length;

    if (count > 0) {
      showProgress('已翻译 ' + count + ' 个元素', 'done');
      // 关键词高亮
      highlightKeywords();
    } else {
      showProgress('翻译失败 - 网络不通', 'error');
      isEnabled = false;
    }

    setTimeout(hideProgress, 3000);
    console.log('[BT] 初始翻译完成! 已翻译:', count, '个元素');
  }

  function restorePage() {
    isEnabled = false;
    for (const [node, original] of originalTexts) {
      if (node.parentElement) {
        node.textContent = original;
        node.parentElement.removeAttribute(BT_ATTR);
      }
    }
    originalTexts.clear();
    // 清除高亮
    document.querySelectorAll('[bt-highlight]').forEach(el => el.removeAttribute('bt-highlight'));
    removeNavButton();
    hideProgress();
    console.log('[BT] 已还原');
  }

  function startObserver() {
    const queue = [];
    let isProcessing = false;

    async function processQueue() {
      if (isProcessing || queue.length === 0 || !isEnabled) return;
      isProcessing = true;

      const batch = queue.splice(0, 10);
      const originals = batch.map(n => n.textContent.trim());

      try {
        const translations = await translateTexts(originals);
        applyTranslations(batch, originals, translations);
        // 动态内容翻译后也检查高亮
        if (keywords.length > 0) highlightKeywords();
      } catch (e) {
        console.warn('[BT] 动态内容翻译失败:', e.message);
      }

      isProcessing = false;
      if (queue.length > 0) {
        setTimeout(processQueue, 50);
      }
    }

    const observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;
      let hasNew = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute(BT_ATTR)) {
            const newNodes = findTextNodes(node);
            for (const n of newNodes) {
              if (n.parentElement && !n.parentElement.hasAttribute(BT_ATTR)) {
                queue.push(n);
                hasNew = true;
              }
            }
          }
        }
      }

      if (hasNew && !isProcessing) {
        setTimeout(processQueue, 100);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[BT] MutationObserver 已启动（队列模式）');
  }

  function startPeriodicScan() {
    let lastCount = 0;
    setInterval(() => {
      if (!isEnabled) return;
      const untranslated = findTextNodes(document.body);
      const newCount = untranslated.length;
      if (newCount > 0 && newCount !== lastCount) {
        console.log('[BT] 定时扫描发现', newCount, '个未翻译节点');
        lastCount = newCount;
        const originals = untranslated.map(n => n.textContent.trim());
        translateTexts(originals).then(translations => {
          applyTranslations(untranslated, originals, translations);
          if (keywords.length > 0) highlightKeywords();
        });
      } else {
        lastCount = newCount;
      }
    }, 3000);
  }

  async function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        if (resp && resp.settings) {
          targetLang = resp.settings.targetLang || 'zh-CN';
          keywords = resp.settings.keywords || [];
          console.log('[BT] 设置已加载, 引擎:', resp.settings.engine, ', 目标语言:', targetLang, ', 关键词:', keywords.join(','));
          if (resp.settings.enabled === false) return false;
        }
      }
    } catch (e) {
      console.warn('[BT] 获取设置失败，使用默认值:', e.message);
    }
    return true;
  }

  // 监听来自 background 的消息
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'TRANSLATE_PAGE') {
        if (msg.enabled && !isEnabled) {
          loadSettings().then(() => translatePage().then(() => { startObserver(); startPeriodicScan(); }));
        } else if (!msg.enabled && isEnabled) {
          restorePage();
        }
      }
      // 设置更新时重新加载关键词
      if (msg.type === 'SETTINGS_UPDATED') {
        loadSettings().then(() => {
          if (isEnabled) highlightKeywords();
        });
      }
    });
  }

  function startWhenReady() {
    const go = () => {
      console.log('[BT] Browser Translator 已加载');
      loadSettings().then(ok => {
        if (ok !== false) translatePage().then(() => { startObserver(); startPeriodicScan(); });
      }).catch(e => {
        console.error('[BT] 启动失败:', e.message);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(go, 300));
    } else {
      setTimeout(go, 300);
    }
  }
  startWhenReady();
})();
