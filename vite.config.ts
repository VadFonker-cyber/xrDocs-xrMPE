import path from 'node:path';
import fs from 'node:fs/promises';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { generateContentData } from './scripts/generate-content-data.mjs';

const markdownWatchPattern = /[/\\]docs[/\\](?:ru|en)[/\\].+\.md$/i;

function docsContentReloadPlugin(): Plugin {
  let server: ViteDevServer;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingFile = '';
  // Cache of known markdown module files — avoids scanning the entire module graph on every .md change
  const rawMarkdownModuleFiles = new Set<string>();

  const runGeneration = async (reason: string, shouldReload: boolean) => {
    try {
      const result = await generateContentData({ rootDir: server.config.root });
      invalidateGeneratedModules(server);
      invalidateRawMarkdownModules(server, pendingFile, rawMarkdownModuleFiles);

      if (shouldReload) {
        server.ws.send({ type: 'full-reload' });
      }

      server.config.logger.info(`[docs] Generated metadata for ${result.docs} documentation pages (${reason}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      server.config.logger.error(`[docs] Content generation failed (${reason}): ${message}`);
      server.ws.send({
        type: 'error',
        err: {
          message,
          stack,
        },
      });
    }
  };

  const scheduleGeneration = (reason: string, file: string) => {
    pendingFile = file;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runGeneration(reason, true);
    }, 120);
  };

  return {
    name: 'xr-docs-content-reload',
    apply: 'serve',
    configureServer(nextServer) {
      server = nextServer;
      server.watcher.add([
        path.resolve(server.config.root, 'docs/ru'),
        path.resolve(server.config.root, 'docs/en'),
      ]);

      void runGeneration('dev server start', false);

      server.watcher.on('all', (event, file) => {
        if (!['add', 'change', 'unlink'].includes(event) || !markdownWatchPattern.test(file)) {
          return;
        }

        if (event === 'unlink') {
          rawMarkdownModuleFiles.delete(file);
        } else {
          rawMarkdownModuleFiles.add(file);
        }

        scheduleGeneration(event, file);
      });
    },
  };
}

function omitPublicCachePlugin(): Plugin {
  let outDir = '';

  return {
    name: 'xr-docs-omit-public-cache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await fs.rm(path.join(outDir, '.asset-cache.json'), { force: true });
    },
  };
}

function invalidateGeneratedModules(server: ViteDevServer) {
  const generatedFiles = [
    path.resolve(server.config.root, 'src/generated/docs-manifest.json'),
    path.resolve(server.config.root, 'src/generated/theme-assets.json'),
    path.resolve(server.config.root, 'src/generated/heading-aliases.json'),
    path.resolve(server.config.root, 'public/search-index.json'),
    path.resolve(server.config.root, 'public/doc-content'),
  ];

  for (const file of generatedFiles) {
    invalidateFileModules(server, file);
  }
}

function invalidateRawMarkdownModules(server: ViteDevServer, changedFile: string, knownFiles: Set<string>) {
  if (changedFile) {
    invalidateFileModules(server, changedFile);
  }

  for (const file of knownFiles) {
    const modules = server.moduleGraph.getModulesByFile(file);
    if (!modules) continue;

    for (const module of modules) {
      if (module.id?.includes('?raw')) {
        server.moduleGraph.invalidateModule(module);
      }
    }
  }
}

function invalidateFileModules(server: ViteDevServer, file: string) {
  const modules = server.moduleGraph.getModulesByFile(path.resolve(file));

  if (!modules) {
    return;
  }

  for (const module of modules) {
    server.moduleGraph.invalidateModule(module);
  }
}

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' ? '/xrDocs-xrMPE/' : './'),
  plugins: [docsContentReloadPlugin(), omitPublicCachePlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'markdown',
              test: '/node_modules/markdown-it/',
            },
            {
              name: 'highlight',
              test: '/node_modules/highlight.js/',
            },
          ],
        },
      },
    },
  },
}));
