class TextFinder {
  constructor() {
    this.skipTags = SKIP_TAGS;
  }

  findTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.hasAttribute(BT_ATTR)) {
            return NodeFilter.FILTER_REJECT;
          }

          const tagName = parent.tagName;
          if (this.skipTags.has(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }

          if (node.textContent.trim().length < MIN_TEXT_LENGTH) {
            return NodeFilter.FILTER_REJECT;
          }

          if (/^[\d\s\p{P}]+$/u.test(node.textContent.trim())) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  findAttributeNodes(root) {
    const results = [];

    const placeholderEls = root.querySelectorAll('[placeholder]');
    const titleEls = root.querySelectorAll('[title]');
    const altEls = root.querySelectorAll('img[alt]');

    for (const el of placeholderEls) {
      if (!el.hasAttribute(BT_PLACEHOLDER_ATTR) && el.getAttribute('placeholder').trim().length >= MIN_TEXT_LENGTH) {
        results.push({ element: el, attr: 'placeholder', value: el.getAttribute('placeholder') });
      }
    }

    for (const el of titleEls) {
      if (!el.hasAttribute(BT_TITLE_ATTR) && el.getAttribute('title').trim().length >= MIN_TEXT_LENGTH) {
        results.push({ element: el, attr: 'title', value: el.getAttribute('title') });
      }
    }

    for (const el of altEls) {
      if (!el.hasAttribute(BT_ALT_ATTR) && el.getAttribute('alt').trim().length >= MIN_TEXT_LENGTH) {
        results.push({ element: el, attr: 'alt', value: el.getAttribute('alt') });
      }
    }

    return results;
  }

  groupTextsByParent(nodes) {
    const groups = new Map();

    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent) continue;

      if (!groups.has(parent)) {
        groups.set(parent, []);
      }
      groups.get(parent).push(node);
    }

    return groups;
  }
}
