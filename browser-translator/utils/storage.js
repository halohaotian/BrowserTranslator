async function getSettings() {
  const result = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

async function isSiteExcluded(url) {
  const settings = await getSettings();
  if (!settings.excludedSites || settings.excludedSites.length === 0) return false;
  const hostname = new URL(url).hostname;
  return settings.excludedSites.some(site => hostname.includes(site));
}
