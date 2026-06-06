import fs from 'node:fs';
import path from 'node:path';
import { compareDocs } from './shared-utils.mjs';

export function readContentModel(docsDir) {
  const nav = {
    ru: parseInit(docsDir, 'ru'),
    en: parseInit(docsDir, 'en'),
  };
  const navEntries = {
    ru: flattenNav(nav.ru),
    en: flattenNav(nav.en),
  };
  const docs = ['ru', 'en']
    .flatMap((lang) => createDocsFromNav(docsDir, lang, navEntries[lang]))
    .sort(compareDocs);

  return { docs, nav, navEntries };
}

function parseInit(docsDir, lang) {
  const initPath = path.join(docsDir, lang, 'init.md');

  if (!fs.existsSync(initPath)) {
    return [];
  }

  const sections = [];
  let currentSection;
  let stack = [];
  let order = 0;

  const ensureSection = (title) => {
    const nextTitle = title || currentSection?.title || 'Documents';

    if (!currentSection || currentSection.title !== nextTitle) {
      currentSection = { title: nextTitle, children: [] };
      sections.push(currentSection);
      stack = [{ indent: -1, children: currentSection.children }];
    }

    return currentSection;
  };

  for (const rawLine of fs.readFileSync(initPath, 'utf8').split('\n')) {
    const heading = rawLine.trim().match(/^#{1,6}\s+(.+)$/);

    if (heading) {
      ensureSection(heading[1].trim());
      continue;
    }

    const item = parseListItem(rawLine);

    if (!item) {
      continue;
    }

    ensureSection();

    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const node = {
      title: item.title,
      order,
      depth: stack.length - 1,
      children: [],
    };

    if (item.href) {
      const id = normalizeDocId(item.href, lang);

      if (id && id !== 'init') {
        node.id = id;
        node.path = `docs/${lang}/${id}.md`;
        validateDocLink(docsDir, lang, node);
      }
    }

    parent.children.push(node);
    stack.push({ indent: item.indent, children: node.children });
    order += 1;
  }

  return sections.filter((section) => section.children.length > 0);
}

function parseListItem(rawLine) {
  const match = rawLine.replace(/\t/g, '    ').match(/^(\s*)[-*]\s+(.+?)\s*$/);

  if (!match) {
    return undefined;
  }

  const link = match[2].match(/^\[([^\]]+)]\(([^)]+\.md(?:#[^)]+)?)\)$/i);

  return {
    indent: match[1].length,
    title: (link?.[1] || match[2]).trim(),
    href: link?.[2],
  };
}

function flattenNav(sections) {
  const entries = [];

  for (const section of sections) {
    collectNodes(section.children, section.title, entries);
  }

  return entries;
}

function collectNodes(nodes, section, entries) {
  for (const node of nodes) {
    if (node.id) {
      entries.push({
        id: node.id,
        title: node.title,
        section,
        order: node.order,
        depth: node.depth,
      });
    }

    collectNodes(node.children, section, entries);
  }
}

function createDocsFromNav(docsDir, lang, entries) {
  const seen = new Set();

  return entries
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }

      seen.add(entry.id);
      return true;
    })
    .map((entry) => {
      const file = getDocFilePath(docsDir, lang, entry.id);
      const raw = fs.readFileSync(file, 'utf8');
      const updatedAt = fs.statSync(file).mtime;
      const relative = slash(path.relative(docsDir, file));

      return {
        id: entry.id,
        lang,
        path: `docs/${relative}`,
        title: extractTitle(raw) || entry.title || 'Untitled',
        content: raw,
        updatedAt,
        section: entry.section || 'Documents',
        order: entry.order,
      };
    });
}

function validateDocLink(docsDir, lang, node) {
  const file = getDocFilePath(docsDir, lang, node.id);

  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing Markdown file referenced from init.md: lang=${lang}, title="${node.title}", path="${node.path}".`,
    );
  }
}

function getDocFilePath(docsDir, lang, id) {
  const relative = path.normalize(`${id}.md`);

  if (path.isAbsolute(relative) || relative.startsWith('..')) {
    throw new Error(`Invalid Markdown path in ${lang}/init.md: "${id}.md".`);
  }

  return path.join(docsDir, lang, ...relative.split(/[\\/]/));
}

function normalizeDocId(filePath, lang) {
  return filePath
    .split('#')[0]
    .replace(/^\.\//, '')
    .replace(/^docs\//, '')
    .replace(new RegExp(`^${lang}/`), '')
    .replace(/^(ru|en)\//, '')
    .replace(/\.md$/i, '');
}

function extractTitle(content) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : '';
}

function slash(value) {
  return value.replace(/\\/g, '/');
}
