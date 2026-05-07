class DomTranslator {
  constructor() {
    this.originalTexts = new Map();
    this.originalAttrs = new Map();
    this.finder = new TextFinder();
  }

  async translatePage(translateFn) {
    const textNodes = this.finder.findTextNodes(document.body);
    const attrNodes = this.finder.findAttributeNodes(document.body);

    if (textNodes.length === 0 && attrNodes.length === 0) return;

    const textsToTranslate = textNodes.map(n => n.textContent.trim());
    const attrTextsToTranslate = attrNodes.map(a => a.value.trim());
    const allTexts = [...textsToTranslate, ...attrTextsToTranslate];

    const translations = await translateFn(allTexts);

    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const translated = translations[i];
      if (translated && translated !== textsToTranslate[i]) {
        this.originalTexts.set(node, node.textContent);
        node.textContent = translated;
        if (node.parentElement) {
          node.parentElement.setAttribute(BT_ATTR, 'true');
        }
      }
    }

    for (let i = 0; i < attrNodes.length; i++) {
      const { element, attr, value } = attrNodes[i];
      const translated = translations[textNodes.length + i];
      if (translated && translated !== attrTextsToTranslate[i]) {
        const backupAttr = attr === 'placeholder' ? BT_PLACEHOLDER_ATTR
          : attr === 'title' ? BT_TITLE_ATTR
          : BT_ALT_ATTR;
        element.setAttribute(backupAttr, value);
        element.setAttribute(attr, translated);
        element.setAttribute(BT_ATTR, 'true');
        this.originalAttrs.set(element, { attr, original: value });
      }
    }
  }

  translateNewNodes(mutations, translateFn) {
    const newNodes = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute(BT_ATTR)) {
          newNodes.push(node);
        }
      }
    }

    if (newNodes.length === 0) return Promise.resolve();

    const allTextNodes = [];
    const allAttrNodes = [];

    for (const node of newNodes) {
      allTextNodes.push(...this.finder.findTextNodes(node));
      allAttrNodes.push(...this.finder.findAttributeNodes(node));
    }

    if (allTextNodes.length === 0 && allAttrNodes.length === 0) return Promise.resolve();

    const texts = [
      ...allTextNodes.map(n => n.textContent.trim()),
      ...allAttrNodes.map(a => a.value.trim())
    ];

    return translateFn(texts).then(translations => {
      for (let i = 0; i < allTextNodes.length; i++) {
        const node = allTextNodes[i];
        const translated = translations[i];
        const original = allTextNodes[i].textContent.trim();
        if (translated && translated !== original) {
          this.originalTexts.set(node, node.textContent);
          node.textContent = translated;
          if (node.parentElement) {
            node.parentElement.setAttribute(BT_ATTR, 'true');
          }
        }
      }

      for (let i = 0; i < allAttrNodes.length; i++) {
        const { element, attr, value } = allAttrNodes[i];
        const translated = translations[allTextNodes.length + i];
        if (translated && translated !== value.trim()) {
          const backupAttr = attr === 'placeholder' ? BT_PLACEHOLDER_ATTR
            : attr === 'title' ? BT_TITLE_ATTR
            : BT_ALT_ATTR;
          element.setAttribute(backupAttr, value);
          element.setAttribute(attr, translated);
          element.setAttribute(BT_ATTR, 'true');
        }
      }
    });
  }

  restorePage() {
    for (const [node, original] of this.originalTexts) {
      if (node.parentElement) {
        node.textContent = original;
        node.parentElement.removeAttribute(BT_ATTR);
      }
    }

    for (const [element, { attr, original }] of this.originalAttrs) {
      element.setAttribute(attr, original);
      element.removeAttribute(BT_ATTR);
      const backupAttr = attr === 'placeholder' ? BT_PLACEHOLDER_ATTR
        : attr === 'title' ? BT_TITLE_ATTR
        : BT_ALT_ATTR;
      element.removeAttribute(backupAttr);
    }

    this.originalTexts.clear();
    this.originalAttrs.clear();
  }
}
