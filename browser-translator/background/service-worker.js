try {
  importScripts(
    '../utils/constants.js',
    '../engines/engine-interface.js',
    '../engines/google-engine.js',
    '../engines/deepl-engine.js',
    '../engines/baidu-engine.js',
    '../engines/custom-engine.js'
  );
  console.log('[BT] Service worker scripts loaded');
} catch (e) {
  console.error('[BT] Failed to import scripts:', e.message);
}

const translationCache = new Map();
const CACHE_MAX_SIZE = 500;

function getEngine(engineName, settings) {
  const config = settings.engines ? settings.engines[engineName] : {};
  switch (engineName) {
    case 'google': return new GoogleEngine(config || {});
    case 'deepl': return new DeepLEngine(config || {});
    case 'baidu': return new BaiduEngine(config || {});
    case 'custom': return new CustomEngine(config || {});
    default: return new GoogleEngine(config || {});
  }
}

function getCachedTranslation(text, sourceLang, targetLang, engine) {
  const key = `${engine}:${sourceLang}:${targetLang}:${text}`;
  return translationCache.get(key) || null;
}

function setCachedTranslation(text, sourceLang, targetLang, engine, translation) {
  const key = `${engine}:${sourceLang}:${targetLang}:${text}`;
  if (translationCache.size >= CACHE_MAX_SIZE) {
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(key, translation);
}

async function getSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const merged = { ...DEFAULT_SETTINGS, ...result.settings };
    if (merged.engines) {
      merged.engines = {
        ...DEFAULT_SETTINGS.engines,
        ...merged.engines
      };
    }
    return merged;
  } catch (e) {
    console.error('[BT] Failed to read settings:', e.message);
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE') {
    handleTranslate(message).then(sendResponse).catch(err => {
      console.error('[BT] handleTranslate error:', err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(settings => {
      sendResponse({ settings });
    }).catch(err => {
      console.error('[BT] GET_SETTINGS error:', err.message);
      sendResponse({ settings: { ...DEFAULT_SETTINGS } });
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.settings).then(() => {
      notifyAllTabs(message.settings);
      sendResponse({ success: true });
    }).catch(err => {
      console.error('[BT] SAVE_SETTINGS error:', err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'UPDATE_BADGE') {
    chrome.action.setBadgeText({ text: message.enabled ? 'ON' : '' });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TOGGLE_ENABLED') {
    getSettings().then(settings => {
      settings.enabled = message.enabled;
      saveSettings(settings).then(() => {
        notifyAllTabs(settings);
        sendResponse({ success: true, settings });
      });
    }).catch(err => {
      console.error('[BT] TOGGLE_ENABLED error:', err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleTranslate(message) {
  const settings = await getSettings();
  const { texts, sourceLang, targetLang, engine } = message;
  const engineName = engine || settings.engine || 'google';
  const sl = sourceLang || settings.sourceLang || 'auto';
  const tl = targetLang || settings.targetLang || 'zh-CN';

  console.log(`[BT] Translating ${texts.length} texts via ${engineName} ${sl}->${tl}`);

  const uncachedTexts = [];
  const uncachedIndices = [];
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i++) {
    const cached = getCachedTranslation(texts[i], sl, tl, engineName);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedTexts.push(texts[i]);
      uncachedIndices.push(i);
    }
  }

  if (uncachedTexts.length > 0) {
    try {
      const engineInstance = getEngine(engineName, settings);
      const translations = await engineInstance.translateBatch(uncachedTexts, sl, tl);

      for (let i = 0; i < uncachedTexts.length; i++) {
        results[uncachedIndices[i]] = translations[i];
        setCachedTranslation(uncachedTexts[i], sl, tl, engineName, translations[i]);
      }
    } catch (err) {
      console.error('[BT] Engine error:', err.message);
      for (let i = 0; i < uncachedTexts.length; i++) {
        results[uncachedIndices[i]] = uncachedTexts[i];
      }
    }
  }

  return { translations: results };
}

async function notifyAllTabs(settings) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TRANSLATE_PAGE',
          enabled: settings.enabled
        }).catch(() => {});
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_UPDATED'
        }).catch(() => {});
      } catch (e) {}
    }
  } catch (e) {
    console.error('[BT] notifyAllTabs error:', e.message);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-translation') {
    const settings = await getSettings();
    settings.enabled = !settings.enabled;
    await saveSettings(settings);
    await notifyAllTabs(settings);
    chrome.action.setBadgeText({
      text: settings.enabled ? 'ON' : ''
    });
  }

  if (command === 'start-translation') {
    const settings = await getSettings();
    if (!settings.enabled) {
      settings.enabled = true;
      await saveSettings(settings);
    }
    await notifyAllTabs(settings);
    chrome.action.setBadgeText({ text: 'ON' });
  }

  if (command === 'stop-translation') {
    const settings = await getSettings();
    if (settings.enabled) {
      settings.enabled = false;
      await saveSettings(settings);
    }
    await notifyAllTabs(settings);
    chrome.action.setBadgeText({ text: '' });
  }
});

getSettings().then(settings => {
  console.log('[BT] Initial settings, enabled:', settings.enabled);
  if (settings.enabled) {
    chrome.action.setBadgeText({ text: 'ON' });
  }
}).catch(e => {
  console.error('[BT] Init error:', e.message);
});
