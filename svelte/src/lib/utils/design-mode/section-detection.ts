// =============================================================================
// Section Detection for Rearrange Mode
// =============================================================================

import { identifyElement } from '../element-identification';
import type { DetectedSection, SectionRect } from './types';

const MIN_SECTION_HEIGHT = 40;

const SECTION_TAGS = new Set([
  'nav', 'header', 'main', 'section', 'article', 'footer', 'aside',
]);

const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'link', 'meta', 'br', 'hr',
  'svg', 'canvas', 'img',
]);

const SECTION_ROLES: Record<string, string> = {
  navigation: 'Navigation',
  banner: 'Header',
  main: 'Main Content',
  contentinfo: 'Footer',
  complementary: 'Aside',
  search: 'Search',
  region: 'Region',
  article: 'Article',
};

const TAG_LABELS: Record<string, string> = {
  nav: 'Navigation',
  header: 'Header',
  main: 'Main',
  section: 'Section',
  article: 'Article',
  footer: 'Footer',
  aside: 'Aside',
};

function isEffectivelyFixed(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.position === 'fixed' || style.position === 'sticky') return true;
    current = current.parentElement;
  }
  return false;
}

function getCleanClassName(el: HTMLElement): string | null {
  if (!el.className || typeof el.className !== 'string') return null;
  return el.className
    .split(/\s+/)
    .filter((c) => c.length > 0 && !/^[a-zA-Z0-9]{6,}$/.test(c))
    .join(' ') || null;
}

function getTextSnippet(el: HTMLElement): string | null {
  const text = el.textContent?.trim();
  if (!text) return null;
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

export function generateSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();

  if (['nav', 'header', 'footer', 'main'].includes(tag)) {
    if (document.querySelectorAll(tag).length === 1) return tag;
  }

  if (el.id) return `#${CSS.escape(el.id)}`;

  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(/\s+/).filter((c) => c.length > 0);
    const meaningful = classes.find(
      (c) => c.length > 2 && !/^[a-zA-Z0-9]{6,}$/.test(c) && !/^[a-z]{1,2}$/.test(c),
    );
    if (meaningful) {
      const selector = `${tag}.${CSS.escape(meaningful)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
  }

  const parent = el.parentElement;
  if (parent) {
    const children = Array.from(parent.children);
    const index = children.indexOf(el) + 1;
    const parentSelector =
      parent === document.body ? 'body' : generateSelector(parent as HTMLElement);
    return `${parentSelector} > ${tag}:nth-child(${index})`;
  }

  return tag;
}

export function labelSection(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const role = el.getAttribute('role');
  if (role && SECTION_ROLES[role]) return SECTION_ROLES[role];

  if (TAG_LABELS[tag]) return TAG_LABELS[tag];

  const heading = el.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    const text = heading.textContent?.trim();
    if (text && text.length <= 50) return text;
    if (text) return text.slice(0, 47) + '...';
  }

  const { name } = identifyElement(el);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function detectPageSections(): DetectedSection[] {
  const main = document.querySelector('main') || document.body;
  const candidates = Array.from(main.children) as HTMLElement[];

  let allCandidates = candidates;
  if (main !== document.body && candidates.length < 3) {
    allCandidates = Array.from(document.body.children) as HTMLElement[];
  }

  const sections: DetectedSection[] = [];

  allCandidates.forEach((el, index) => {
    if (!(el instanceof HTMLElement)) return;

    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (el.hasAttribute('data-feedback-toolbar')) return;
    if (el.closest('[data-feedback-toolbar]')) return;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const rect = el.getBoundingClientRect();
    if (rect.height < MIN_SECTION_HEIGHT) return;

    const isSemantic = SECTION_TAGS.has(tag);
    const role = el.getAttribute('role');
    const hasRole = role && SECTION_ROLES[role];
    const isSignificantDiv = tag === 'div' && rect.height >= 60;

    if (!isSemantic && !hasRole && !isSignificantDiv) return;

    const scrollY = window.scrollY;
    const isFixed = isEffectivelyFixed(el);

    const sectionRect: SectionRect = {
      x: rect.x,
      y: isFixed ? rect.y : rect.y + scrollY,
      width: rect.width,
      height: rect.height,
    };

    sections.push({
      id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: labelSection(el),
      tagName: tag,
      selector: generateSelector(el),
      role: el.getAttribute('role'),
      className: getCleanClassName(el),
      textSnippet: getTextSnippet(el),
      originalRect: sectionRect,
      currentRect: { ...sectionRect },
      originalIndex: index,
      isFixed,
    });
  });

  return sections;
}

export function captureElement(el: HTMLElement): DetectedSection {
  const scrollY = window.scrollY;
  const rect = el.getBoundingClientRect();
  const isFixed = isEffectivelyFixed(el);

  const sectionRect: SectionRect = {
    x: rect.x,
    y: isFixed ? rect.y : rect.y + scrollY,
    width: rect.width,
    height: rect.height,
  };

  const parent = el.parentElement;
  let originalIndex = 0;
  if (parent) {
    originalIndex = Array.from(parent.children).indexOf(el);
  }

  return {
    id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: labelSection(el),
    tagName: el.tagName.toLowerCase(),
    selector: generateSelector(el),
    role: el.getAttribute('role'),
    className: getCleanClassName(el),
    textSnippet: getTextSnippet(el),
    originalRect: sectionRect,
    currentRect: { ...sectionRect },
    originalIndex,
    isFixed,
  };
}
