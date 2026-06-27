let searchModulePromise: Promise<typeof import('./search')> | undefined;

export function loadSearchModule(): Promise<typeof import('./search')> {
  return searchModulePromise ??= import('./search');
}
