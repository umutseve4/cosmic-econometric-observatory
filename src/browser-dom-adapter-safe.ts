import type { BrowserDomPort } from './browser-renderer.js';
import { createBrowserDomPort as createValidatedBrowserDomPort } from './browser-dom-adapter.js';
import { validateSourceAttributes } from './browser-dom-source-validator.js';

export function createBrowserDomPort(document: Document): BrowserDomPort<Node> {
  const validated = createValidatedBrowserDomPort(document);
  return {
    prepareHtml(content) {
      validateSourceAttributes(content, 'html');
      return validated.prepareHtml(content);
    },
    prepareSvg(content) {
      validateSourceAttributes(content, 'svg');
      return validated.prepareSvg(content);
    }
  };
}
