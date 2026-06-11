import fs from 'node:fs/promises';
import path from 'node:path';
import { compareDocs, slash } from './shared-utils.mjs';

export async function readContentModel(docsDir) {
  const [ruNav, enNav] = await Promise.all([
    parseInit(docsDir, 'ru'),
    parseInit(docsDir, 'en'),
  ]);
  const nav = {
    ru: ruNav,
    en: enNav,
  };
  const navEntries = {
    ru: flattenNav(nav.ru),
    en: flattenNav(nav.en),
  };
  const docsByLang = await Promise.all(
    ['ru', 'en'].map((lang) => createDocsFromNav(docsDir, lang, navEntries[lang])),
  );
  const docs = docsByLang
    .flat()
    .sort(compareDocs);

  return { docs, nav, navEntries };
}

async function parseInit(docsDir, lang) {
  const initPath = path.join(docsDir, lang, 'init.md');
  let content;

  try {
    content = await fs.readFile(initPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const sections = [];
  let currentSection;
  let stack = [];
  let order = 0;
  const linkValidations = [];

  const ensureSection = (title) => {
    const nextTitle = title || currentSection?.title || 'Documents';

    if (!currentSection || currentSection.title !== nextTitle) {
      currentSection = { title: nextTitle, children: [] };
      sections.push(currentSection);
      stack = [{ indent: -1, children: currentSection.children }];
    }

    return currentSection;
  };

  for (const rawLine of content.split('\n')) {
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
        linkValidations.push(validateDocLink(docsDir, lang, node));
      }
    }

    parent.children.push(node);
    stack.push({ indent: item.indent, children: node.children });
    order += 1;
  }

  await Promise.all(linkValidations);
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

async function createDocsFromNav(docsDir, lang, entries) {
  const seen = new Set();

  const uniqueEntries = entries
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }

      seen.add(entry.id);
      return true;
    });

  return Promise.all(
    uniqueEntries.map(async (entry) => {
      const file = getDocFilePath(docsDir, lang, entry.id);
      const [raw, stats] = await Promise.all([
        fs.readFile(file, 'utf8'),
        fs.stat(file),
      ]);
      const updatedAt = stats.mtime;
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
    }),
  );
}

async function validateDocLink(docsDir, lang, node) {
  const file = getDocFilePath(docsDir, lang, node.id);

  try {
    await fs.access(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

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
