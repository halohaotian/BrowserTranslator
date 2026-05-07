document.addEventListener('DOMContentLoaded', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = response.settings;

  document.getElementById('googleEnabled').checked = settings.engines.google.enabled;
  document.getElementById('deeplEnabled').checked = settings.engines.deepl.enabled;
  document.getElementById('deeplApiKey').value = settings.engines.deepl.apiKey || '';
  document.getElementById('baiduEnabled').checked = settings.engines.baidu.enabled;
  document.getElementById('baiduAppId').value = settings.engines.baidu.appId || '';
  document.getElementById('baiduSecretKey').value = settings.engines.baidu.secretKey || '';
  document.getElementById('customEnabled').checked = settings.engines.custom.enabled;
  document.getElementById('customUrl').value = settings.engines.custom.url || '';
  document.getElementById('customApiKey').value = settings.engines.custom.apiKey || '';
  document.getElementById('excludedSites').value = (settings.excludedSites || []).join('\n');

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const newSettings = {
      ...settings,
      engines: {
        google: { apiKey: '', enabled: document.getElementById('googleEnabled').checked },
        deepl: { apiKey: document.getElementById('deeplApiKey').value, enabled: document.getElementById('deeplEnabled').checked },
        baidu: {
          appId: document.getElementById('baiduAppId').value,
          secretKey: document.getElementById('baiduSecretKey').value,
          enabled: document.getElementById('baiduEnabled').checked
        },
        custom: {
          url: document.getElementById('customUrl').value,
          apiKey: document.getElementById('customApiKey').value,
          enabled: document.getElementById('customEnabled').checked
        }
      },
      excludedSites: document.getElementById('excludedSites').value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
    };

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: newSettings
    });

    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = '已保存';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});
