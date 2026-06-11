import { debounce, type DebouncedFunction } from './utils/debounce';

type StatisticParams = Record<string, string | number | boolean | undefined>;
type StateChangeParams = StatisticParams & {
  from: string;
  to: string;
};

type PageView = {
  lang: string;
  path: string;
  title: string;
};

type UmamiTracker = {
  identify(payload: string | Record<string, unknown>, data?: Record<string, unknown>): void;
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
const trackingDomains = import.meta.env.VITE_UMAMI_DOMAINS?.trim() || '';
const enabledInDev = import.meta.env.VITE_ENABLE_STATISTICS_IN_DEV === 'true';
const shouldCollect = Boolean(websiteId && scriptUrl && (import.meta.env.PROD || enabledInDev));
const loadTimeoutMs = 8000;
const maxQueuedEvents = 20;
const visitorStorageKey = 'xrDocsVisitorId';
const visitorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usageStorageKey = 'xrDocsStatisticsUsage:v1';
const samePageViewCooldownMs = 5_000;
const eventWindowMs = 60_000;
const maxEventsPerWindow = 10;
const maxSameEventPerWindow = 5;

type UsageBucket = {
  count: number;
  expiresAt: number;
};

type UsageState = {
  lastPageViews: Record<string, number>;
  recent: Record<string, UsageBucket>;
};

type PendingStateChange = {
  event: string;
  from: string;
  to: string;
  params: StatisticParams;
  flush: DebouncedFunction<() => void>;
};

let status: 'disabled' | 'loading' | 'ready' | 'failed' = shouldCollect ? 'loading' : 'disabled';
let initialized = false;
let identified = false;
let loadTimeout: number | undefined;
let queuedEvents: Array<() => void> = [];
let fallbackVisitorId: string | undefined;
let fallbackUsageState: UsageState = createUsageState();
const pendingStateChanges = new Map<string, PendingStateChange>();
const stateChangeDebounceMs = 1500;

export function initStatistics(): void {
  if (!shouldCollect || initialized) {
    return;
  }

  initialized = true;
  window.addEventListener('pagehide', flushPendingStateChangeEvents);
  loadUmamiScript();
}

export function collectPageView(page: PageView): void {
  const url = new URL(page.path, window.location.origin).toString();

  if (!reservePageView(url)) {
    return;
  }

  queueOrCollect(() => {
    window.umami?.track((props) => ({
      ...props,
      id: readOrCreateVisitorId(),
      data: cleanParams({
        lang: page.lang,
      }),
      title: page.title,
      url,
    }));
  });
}

export function collectEvent(event: string, params: StatisticParams = {}): void {
  const name = formatEventName(event);

  if (!reserveEvent(name)) {
    return;
  }

  queueOrCollect(() => {
    window.umami?.track((props) => ({
      ...props,
      data: cleanParams(params),
      id: readOrCreateVisitorId(),
      name,
    }));
  });
}

export function collectStateChangeEvent(event: string, params: StateChangeParams): void {
  if (!shouldCollect) {
    return;
  }

  const pending = pendingStateChanges.get(event);

  if (pending) {
    pending.to = params.to;
    pending.params = params;
    pending.flush();
    return;
  }

  const nextPending = createPendingStateChange(event, params);
  pendingStateChanges.set(event, nextPending);
  nextPending.flush();
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

function flushPendingStateChangeEvents(): void {
  const pendingEvents = [...pendingStateChanges.values()];
  pendingStateChanges.clear();

  for (const pending of pendingEvents) {
    pending.flush.cancel();
    sendStateChangeEvent(pending);
  }
}

function createPendingStateChange(event: string, params: StateChangeParams): PendingStateChange {
  let pending: PendingStateChange;
  const flush = debounce(() => {
    pendingStateChanges.delete(event);
    sendStateChangeEvent(pending);
  }, stateChangeDebounceMs);

  pending = {
    event,
    from: params.from,
    to: params.to,
    params,
    flush,
  };

  return pending;
}

function sendStateChangeEvent(pending: PendingStateChange): void {
  if (pending.from === pending.to) {
    return;
  }

  collectEvent(pending.event, {
    ...pending.params,
    from: pending.from,
    to: pending.to,
  });
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
  if (trackingDomains) {
    script.dataset.domains = trackingDomains;
  }
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

  try {
    window.umami?.identify({ id: visitorId });
    identified = true;
  } catch {
    identified = false;
  }
}

function readOrCreateVisitorId(): string {
  try {
    const existingId = localStorage.getItem(visitorStorageKey);

    if (existingId && isVisitorId(existingId)) {
      return existingId.toLowerCase();
    }

    const visitorId = createVisitorId();
    localStorage.setItem(visitorStorageKey, visitorId);
    return visitorId;
  } catch {
    return readOrCreateFallbackVisitorId();
  }
}

function createVisitorId(): string {
  return globalThis.crypto.randomUUID();
}

function readOrCreateFallbackVisitorId(): string {
  fallbackVisitorId ??= createVisitorId();
  return fallbackVisitorId;
}

function isVisitorId(value: string): boolean {
  return visitorIdPattern.test(value);
}

function reservePageView(url: string): boolean {
  return updateUsageState((state, now) => {
    const lastPageViewAt = state.lastPageViews[url] || 0;
    if (now - lastPageViewAt < samePageViewCooldownMs) {
      return false;
    }

    state.lastPageViews[url] = now;
    return true;
  });
}

function reserveEvent(name: string): boolean {
  return updateUsageState((state, now) => {
    if (
      !hasBucketCapacity(state, 'event:*', maxEventsPerWindow, eventWindowMs, now) ||
      !hasBucketCapacity(state, `event:${name}`, maxSameEventPerWindow, eventWindowMs, now)
    ) {
      return false;
    }

    consumeBucket(state, 'event:*', eventWindowMs, now);
    consumeBucket(state, `event:${name}`, eventWindowMs, now);
    return true;
  });
}

function updateUsageState(mutator: (state: UsageState, now: number) => boolean): boolean {
  const now = Date.now();

  try {
    const state = normalizeUsageState(readUsageState(), now);
    const allowed = mutator(state, now);

    if (allowed) {
      localStorage.setItem(usageStorageKey, JSON.stringify(state));
    }

    return allowed;
  } catch {
    fallbackUsageState = normalizeUsageState(fallbackUsageState, now);
    return mutator(fallbackUsageState, now);
  }
}

function readUsageState(): UsageState {
  const raw = localStorage.getItem(usageStorageKey);

  if (!raw) {
    return createUsageState();
  }

  return JSON.parse(raw) as UsageState;
}

function normalizeUsageState(state: UsageState, now: number): UsageState {
  const recent = Object.fromEntries(
    Object.entries(state.recent || {}).filter(([, bucket]) => bucket.expiresAt > now),
  );
  const lastPageViews = Object.fromEntries(
    Object.entries(state.lastPageViews || {}).filter(([, timestamp]) => now - timestamp < samePageViewCooldownMs),
  );

  return {
    lastPageViews,
    recent,
  };
}

function createUsageState(): UsageState {
  return {
    lastPageViews: {},
    recent: {},
  };
}

function hasBucketCapacity(state: UsageState, key: string, limit: number, windowMs: number, now: number): boolean {
  return getActiveBucket(state, key, windowMs, now).count < limit;
}

function consumeBucket(state: UsageState, key: string, windowMs: number, now: number): void {
  const bucket = getActiveBucket(state, key, windowMs, now);
  bucket.count += 1;
  state.recent[key] = bucket;
}

function getActiveBucket(state: UsageState, key: string, windowMs: number, now: number): UsageBucket {
  const current = state.recent[key];
  return current && current.expiresAt > now
    ? current
    : { count: 0, expiresAt: now + windowMs };
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
