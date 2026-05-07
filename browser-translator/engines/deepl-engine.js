class DeepLEngine extends TranslateEngine {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new Error('DeepL API key not configured');

    const url = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang === 'auto' ? undefined : sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase()
      })
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json();
    return data.translations?.[0]?.text || text;
  }
}
