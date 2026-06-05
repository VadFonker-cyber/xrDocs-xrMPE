export function normalizeBasePath(value) {
  if (!value || value === './') {
    return '/';
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}
