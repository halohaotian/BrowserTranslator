document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enabledToggle');
  const targetLangSelect = document.getElementById('targetLang');
  const engineSelect = document.getElementById('engineSelect');
  const statusText = document.getElementById('statusText');
  const openOptions = document.getElementById('openOptions');

  for (const [code, name] of Object.entries(LANGUAGES)) {
    if (code === 'auto') continue;
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    targetLangSelect.appendChild(option);
  }

  const settings = await getSettings();

  toggle.checked = settings.enabled;
  targetLangSelect.value = settings.targetLang;
  engineSelect.value = settings.engine;
  updateStatus(settings.enabled);

  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    await sendMessage({ type: 'TOGGLE_ENABLED', enabled });
    updateStatus(enabled);
  });

  targetLangSelect.addEventListener('change', async () => {
    const settings = await getSettings();
    settings.targetLang = targetLangSelect.value;
    await sendMessage({ type: 'SAVE_SETTINGS', settings });
  });

  engineSelect.addEventListener('change', async () => {
    const settings = await getSettings();
    settings.engine = engineSelect.value;
    await sendMessage({ type: 'SAVE_SETTINGS', settings });
  });

  openOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function updateStatus(enabled) {
    if (enabled) {
      statusText.textContent = '翻译已开启';
      statusText.className = 'status active';
    } else {
      statusText.textContent = '翻译已关闭';
      statusText.className = 'status inactive';
    }
  }

  async function getSettings() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    return response.settings;
  }

  async function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }
});
