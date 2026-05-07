class TranslateEngine {
  constructor(config) {
    this.config = config;
  }

  async translate(text, sourceLang, targetLang) {
    throw new Error('translate() must be implemented');
  }

  async translateBatch(texts, sourceLang, targetLang) {
    const results = [];
    for (const text of texts) {
      const translated = await this.translate(text, sourceLang, targetLang);
      results.push(translated);
    }
    return results;
  }
}
