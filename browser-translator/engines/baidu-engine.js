class BaiduEngine extends TranslateEngine {
  async translate(text, sourceLang, targetLang) {
    const { appId, secretKey } = this.config;
    if (!appId || !secretKey) throw new Error('Baidu API credentials not configured');

    const salt = Date.now().toString();
    const sign = await this._generateSign(appId, text, salt, secretKey);

    const from = sourceLang === 'auto' ? 'auto' : sourceLang;
    const to = targetLang === 'zh-CN' ? 'zh' : targetLang;

    const url = `https://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=${from}&to=${to}&appid=${appId}&salt=${salt}&sign=${sign}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Baidu API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.trans_result && data.trans_result.length > 0) {
      return data.trans_result.map(r => r.dst).join('\n');
    }
    return text;
  }

  async _generateSign(appId, text, salt, secretKey) {
    const encoder = new TextEncoder();
    const str = appId + text + salt + secretKey;
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null);

    if (!hashBuffer) {
      return this._md5Fallback(str);
    }

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  _md5Fallback(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }
}
