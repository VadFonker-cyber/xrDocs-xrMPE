type StatisticParams = Record<string, string | number | boolean | undefined>;

type PageView = {
  lang: string;
  path: string;
  title: string;
};

type UmamiTracker = {
  identify(id: string): void;
  track(): void;
  track(payload: Record<string, unknown> | ((props: Record<string, unknown>) => Record<string, unknown>)): void;
  track(eventName: string, data?: StatisticParams): void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim() || '';
const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL?.trim() || '';
const enabledInDev = import.meta.env.VITE_ENABLE_STATISTICS_IN_DEV === 'true';
const shouldCollect = Boolean(websiteId && scriptUrl && (import.meta.env.PROD || enabledInDev));
const loadTimeoutMs = 8000;
const maxQueuedEvents = 20;
const visitorStorageKey = 'xrDocsVisitorId';

let status: 'disabled' | 'loading' | 'ready' | 'failed' = shouldCollect ? 'loading' : 'disabled';
let initialized = false;
let identified = false;
let loadTimeout: number | undefined;
let queuedEvents: Array<() => void> = [];

export function initStatistics(): void {
  if (!shouldCollect || initialized) {
    return;
  }

  initialized = true;
  loadUmamiScript();
}

export function collectPageView(page: PageView): void {
  queueOrCollect(() => {
    window.umami?.track((props) => ({
      ...props,
      id: readOrCreateVisitorId(),
      data: cleanParams({
        lang: page.lang,
      }),
      title: page.title,
      url: new URL(page.path, window.location.origin).toString(),
    }));
  });
}

export function collectEvent(event: string, params: StatisticParams = {}): void {
  queueOrCollect(() => {
    window.umami?.track((props) => ({
      ...props,
      data: cleanParams(params),
      id: readOrCreateVisitorId(),
      name: formatEventName(event),
    }));
  });
}

function queueOrCollect(callback: () => void): void {
  if (!shouldCollect || status === 'disabled' || status === 'failed') {
    return;
  }

  if (status === 'loading') {
    queuedEvents = [...queuedEvents.slice(-(maxQueuedEvents - 1)), callback];
    return;
  }

  try {
    callback();
  } catch {
    failStatistics();
  }
}

function loadUmamiScript(): void {
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);

  if (existingScript) {
    status = 'ready';
    identifyVisitor();
    flushQueuedEvents();
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.dataset.websiteId = websiteId;
  script.dataset.autoTrack = 'false';
  script.src = scriptUrl;
  script.onload = () => {
    status = 'ready';
    identifyVisitor();
    clearLoadTimeout();
    flushQueuedEvents();
  };
  script.onerror = () => {
    failStatistics();
    clearLoadTimeout();
  };

  loadTimeout = window.setTimeout(() => {
    failStatistics();
  }, loadTimeoutMs);

  document.head.append(script);
}

function flushQueuedEvents(): void {
  const events = queuedEvents;
  queuedEvents = [];

  for (const event of events) {
    queueOrCollect(event);
  }
}

function identifyVisitor(): void {
  if (identified) {
    return;
  }

  const visitorId = readOrCreateVisitorId();

  if (!visitorId) {
    return;
  }

  try {
    window.umami?.identify(visitorId);
    identified = true;
  } catch {
    identified = false;
  }
}

function readOrCreateVisitorId(): string | undefined {
  try {
    const existingId = localStorage.getItem(visitorStorageKey);

    if (existingId) {
      return existingId;
    }

    const visitorId = createVisitorId();
    localStorage.setItem(visitorStorageKey, visitorId);
    return visitorId;
  } catch {
    return undefined;
  }
}

function createVisitorId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const values = new Uint32Array(4);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
}

function failStatistics(): void {
  status = 'failed';
  queuedEvents = [];
}

function clearLoadTimeout(): void {
  if (loadTimeout !== undefined) {
    window.clearTimeout(loadTimeout);
    loadTimeout = undefined;
  }
}

function cleanParams(params: StatisticParams): StatisticParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );
}

function formatEventName(event: string): string {
  return event
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
