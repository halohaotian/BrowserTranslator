class CustomEngine extends TranslateEngine {
  async translate(text, sourceLang, targetLang) {
    const { url, apiKey } = this.config;
    if (!url) throw new Error('Custom engine URL not configured');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        text,
        source_lang: sourceLang,
        target_lang: targetLang
      })
    });

    if (!response.ok) {
      throw new Error(`Custom engine error: ${response.status}`);
    }

    const data = await response.json();
    return data.translated_text || data.translation || data.text || text;
  }
}
