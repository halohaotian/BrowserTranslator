(function() {
  'use strict';

  const BT_ATTR = 'data-bt-translated';
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA',
    'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR'
  ]);

  let isEnabled = false;
  let isTranslating = false;
  let targetLang = 'zh-CN';
  const originalTexts = new Map();

  // 翻译代数计数器，用于中断旧的翻译任务
  let translationGeneration = 0;

  // ========== 限流器 ==========
  let lastRequestTime = 0;
  const MIN_REQUEST_INTERVAL = 300;

  async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestTime = Date.now();
  }

  // ========== 判断是否已为目标语言文本 ==========
  function isTargetLanguage(text) {
    if (targetLang.startsWith('zh')) {
      const cjk = text.match(/[一-鿿㐀-䶿]/g);
      const total = text.replace(/[\s\p{P}]/gu, '').length;
      if (total === 0) return false;
      return (cjk ? cjk.length : 0) / total > 0.3;
    }
    if (targetLang === 'ja') {
      const ja = text.match(/[぀-ゟ゠-ヿ一-鿿]/g);
      const total = text.replace(/[\s\p{P}]/gu, '').length;
      if (total === 0) return false;
      return (ja ? ja.length : 0) / total > 0.3;
    }
    if (targetLang === 'ko') {
      const ko = text.match(/[가-힯ᄀ-ᇿ]/g);
      const total = text.replace(/[\s\p{P}]/gu, '').length;
      if (total === 0) return false;
      return (ko ? ko.length : 0) / total > 0.3;
    }
    return false;
  }

  // ========== 静默保存 enabled 状态（不触发 notifyAllTabs）==========
  function saveEnabledQuiet(enabled) {
    try {
      chrome.storage.sync.get('settings', (result) => {
        const settings = result.settings || {};
        settings.enabled = enabled;
        chrome.storage.sync.set({ settings });
      });
      // 只更新 badge，不触发 round-trip 消息
      chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', enabled });
    } catch (e) {
      // 静默失败
    }
  }

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

  // ========== 翻译功能 ==========
  async function translateViaGoogle(text) {
    await throttle();
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let result = '';
    if (data && data[0]) {
      for (const p of data[0]) if (p[0]) result += p[0];
    }
    return result || text;
  }

  async function translateViaGoogleWithRetry(text, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await translateViaGoogle(text);
      } catch (e) {
        if (attempt < retries) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[BT] Google API 请求失败，${delay}ms 后重试 (${attempt + 1}/${retries}):`, e.message);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn('[BT] Google API 重试耗尽:', text.substring(0, 30));
          return text;
        }
      }
    }
    return text;
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

  async function translateTexts(texts, gen) {
    // 如果代数已过期，直接返回原文
    if (gen !== translationGeneration) return texts.slice();

    const needTranslate = [];
    const indices = [];
    for (let i = 0; i < texts.length; i++) {
      if (isTargetLanguage(texts[i])) {
        // 已是目标语言，不需要翻译
      } else {
        needTranslate.push(texts[i]);
        indices.push(i);
      }
    }

    if (needTranslate.length === 0) {
      return texts.slice();
    }

    const results = texts.slice();

    // 优先通过 background 翻译
    try {
      if (gen !== translationGeneration) return texts.slice();
      const translations = await translateViaBackground(needTranslate);
      if (gen !== translationGeneration) return texts.slice();
      for (let i = 0; i < indices.length; i++) {
        results[indices[i]] = translations[i];
      }
      const changed = translations.filter((t, i) => t !== needTranslate[i]).length;
      if (changed > 0) return results;
    } catch (e) {
      console.warn('[BT] Background 翻译失败，使用直接 API:', e.message);
    }

    // 逐个翻译并限流
    for (let i = 0; i < indices.length; i++) {
      if (gen !== translationGeneration) return texts.slice();
      const translated = await translateViaGoogleWithRetry(needTranslate[i]);
      results[indices[i]] = translated;
    }
    return results;
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
    isTranslating = true;
    const gen = ++translationGeneration;
    console.log('[BT] 开始翻译 [gen=' + gen + ']... 目标语言:', targetLang);

    const nodes = findTextNodes(document.body);
    console.log('[BT] 找到', nodes.length, '个文本节点');

    if (nodes.length === 0) {
      console.warn('[BT] 没有找到可翻译的文本节点');
      isEnabled = false;
      isTranslating = false;
      return;
    }

    showProgress('翻译中... 0/' + nodes.length, '');

    const batchSize = 3;
    for (let i = 0; i < nodes.length; i += batchSize) {
      // 每次循环前检查是否被中断
      if (gen !== translationGeneration) {
        console.log('[BT] 翻译被中断 [gen=' + gen + ']');
        isTranslating = false;
        return;
      }

      const batch = nodes.slice(i, i + batchSize);
      const originals = batch.map(n => n.textContent.trim());

      try {
        const translations = await translateTexts(originals, gen);
        // await 返回后再检查是否被中断
        if (gen !== translationGeneration) {
          console.log('[BT] 翻译被中断 [gen=' + gen + ']');
          isTranslating = false;
          return;
        }
        applyTranslations(batch, originals, translations);
      } catch (e) {
        console.warn('[BT] 批次翻译失败:', e.message);
      }

      if (i + batchSize < nodes.length) {
        if (gen !== translationGeneration) {
          isTranslating = false;
          return;
        }
        showProgress('翻译中... ' + Math.min(i + batchSize, nodes.length) + '/' + nodes.length, '');
        await new Promise(r => setTimeout(r, 500));
        if (gen !== translationGeneration) {
          isTranslating = false;
          return;
        }
      }
    }

    // 最终检查
    if (gen !== translationGeneration) {
      isTranslating = false;
      return;
    }

    const count = document.querySelectorAll('[' + BT_ATTR + ']').length;

    if (count > 0) {
      showProgress('已翻译 ' + count + ' 个元素', 'done');
    } else {
      showProgress('翻译失败 - 网络不通', 'error');
      isEnabled = false;
    }

    isTranslating = false;
    setTimeout(hideProgress, 3000);
    console.log('[BT] 翻译完成 [gen=' + gen + ']! 已翻译:', count, '个元素');
  }

  function restorePage() {
    // 递增代数，中断所有正在运行的翻译任务
    translationGeneration++;
    isEnabled = false;
    isTranslating = false;

    for (const [node, original] of originalTexts) {
      if (node.parentElement) {
        node.textContent = original;
        node.parentElement.removeAttribute(BT_ATTR);
      }
    }
    originalTexts.clear();
    hideProgress();
    console.log('[BT] 已还原 [gen=' + translationGeneration + ']');
  }

  function startObserver() {
    const queue = [];
    let isProcessing = false;

    async function processQueue() {
      if (isProcessing || queue.length === 0 || !isEnabled || isTranslating) return;
      isProcessing = true;

      const gen = translationGeneration;
      const batch = queue.splice(0, 5);
      const originals = batch.map(n => n.textContent.trim());

      try {
        const translations = await translateTexts(originals, gen);
        if (gen !== translationGeneration) { isProcessing = false; return; }
        applyTranslations(batch, originals, translations);
      } catch (e) {
        console.warn('[BT] 动态内容翻译失败:', e.message);
      }

      isProcessing = false;
      if (queue.length > 0) {
        setTimeout(processQueue, 500);
      }
    }

    const observer = new MutationObserver((mutations) => {
      if (!isEnabled || isTranslating) return;
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
        setTimeout(processQueue, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[BT] MutationObserver 已启动（队列模式）');
  }

  function startPeriodicScan() {
    setInterval(() => {
      if (!isEnabled || isTranslating) return;
      const gen = translationGeneration;
      const untranslated = findTextNodes(document.body);
      if (untranslated.length > 0 && untranslated.length < 50) {
        console.log('[BT] 定时扫描发现', untranslated.length, '个未翻译节点');
        const originals = untranslated.map(n => n.textContent.trim());
        translateTexts(originals, gen).then(translations => {
          if (gen !== translationGeneration) return;
          applyTranslations(untranslated, originals, translations);
        });
      }
    }, 5000);
  }

  async function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        if (resp && resp.settings) {
          targetLang = resp.settings.targetLang || 'zh-CN';
          console.log('[BT] 设置已加载, 引擎:', resp.settings.engine, ', 目标语言:', targetLang);
          if (resp.settings.enabled === false) return false;
        }
      }
    } catch (e) {
      console.warn('[BT] 获取设置失败，使用默认值:', e.message);
    }
    return true;
  }

  // ========== 快捷键直接处理 ==========
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;

    const key = e.key.toLowerCase();

    if (key === 's' && !isEnabled && !isTranslating) {
      e.preventDefault();
      loadSettings().then(() => {
        translatePage().then(() => { startObserver(); startPeriodicScan(); });
      });
      saveEnabledQuiet(true);
    }

    if (key === 'r' && (isEnabled || isTranslating)) {
      e.preventDefault();
      restorePage();
      saveEnabledQuiet(false);
    }

    if (key === 't') {
      e.preventDefault();
      if (isEnabled || isTranslating) {
        restorePage();
        saveEnabledQuiet(false);
      } else {
        loadSettings().then(() => {
          translatePage().then(() => { startObserver(); startPeriodicScan(); });
        });
        saveEnabledQuiet(true);
      }
    }
  });

  // 监听来自 background 的消息（仅响应 popup/options 的操作）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'TRANSLATE_PAGE') {
        if (msg.enabled && !isEnabled && !isTranslating) {
          loadSettings().then(() => translatePage().then(() => { startObserver(); startPeriodicScan(); }));
        } else if (!msg.enabled && (isEnabled || isTranslating)) {
          restorePage();
        }
      }
      if (msg.type === 'SETTINGS_UPDATED') {
        loadSettings();
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
