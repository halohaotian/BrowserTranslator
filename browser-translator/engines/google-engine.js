class GoogleEngine extends TranslateEngine {
  async translate(text, sourceLang, targetLang) {
    const sl = sourceLang === 'auto' ? 'auto' : sourceLang;
    const tl = targetLang;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.status}`);
    }

    const data = await response.json();
    if (data && data[0]) {
      let result = '';
      for (const part of data[0]) {
        if (part[0]) result += part[0];
      }
      return result;
    }
    return text;
  }

  async translateBatch(texts, sourceLang, targetLang) {
    const results = [];
    const chunks = [];
    const chunkSize = 10;

    for (let i = 0; i < texts.length; i += chunkSize) {
      chunks.push(texts.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(text => this.translate(text, sourceLang, targetLang));
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
      if (chunks.length > 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  }
}
