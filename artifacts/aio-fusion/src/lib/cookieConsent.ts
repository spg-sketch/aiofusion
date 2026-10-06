export const CONSENT_KEY = "aio.cookiePreferences.v1";
export const CONSENT_EVENT = "aio:cookie-preferences-changed";
export const OPEN_CONSENT_EVENT = "aio:open-cookie-preferences";
export const ANALYTICS_ID = "G-DTSDJVJN0Q";
const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
type Preference = { version: 1; analytics: boolean; savedAt: number };
let memoryPreference: Preference | null = null;
let initialised = false;

function validPreference(raw: string | null): Preference | null {
  try {
    const parsed = JSON.parse(raw ?? "null");
    return parsed?.version === 1 && typeof parsed.analytics === "boolean"
      && typeof parsed.savedAt === "number" && parsed.savedAt <= Date.now()
      && Date.now() - parsed.savedAt < CONSENT_LIFETIME ? parsed : null;
  } catch { return null; }
}

export function readCookiePreference(): Preference | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = validPreference(localStorage.getItem(CONSENT_KEY));
    return saved;
  } catch { /* Storage may be unavailable; retain the explicit in-tab choice. */ }
  return memoryPreference && validPreference(JSON.stringify(memoryPreference));
}

function clearAnalyticsCookies() {
  const names = document.cookie.split(";").map((entry) => entry.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  const domains = ["", hostname, ...parts.slice(0, -1).map((_, index) => parts.slice(index).join("."))];
  const paths = ["/", import.meta.env.BASE_URL];
  for (const name of names) for (const path of new Set(paths)) for (const domain of new Set(domains)) {
    document.cookie = `${name}=; Max-Age=0; path=${path};${domain ? ` domain=${domain};` : ""} SameSite=Lax`;
  }
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function applyAnalytics(allowed: boolean) {
  const analyticsWindow = window as AnalyticsWindow;
  (window as unknown as Record<string, unknown>)[`ga-disable-${ANALYTICS_ID}`] = !allowed;
  if (!allowed) {
    // Do not send denied-consent pings. Disable collection before removing
    // accessible cookies and the loader; no page reload or editor data loss.
    analyticsWindow.gtag = () => {};
    analyticsWindow.dataLayer = [];
    document.getElementById("aio-analytics-loader")?.remove();
    clearAnalyticsCookies();
    return;
  }
  if (document.getElementById("aio-analytics-loader")) return;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  analyticsWindow.gtag = function () { analyticsWindow.dataLayer!.push(arguments); };
  analyticsWindow.gtag("consent", "default", {
    analytics_storage: "granted", ad_storage: "denied",
    ad_user_data: "denied", ad_personalization: "denied",
  });
  analyticsWindow.gtag("js", new Date());
  analyticsWindow.gtag("config", ANALYTICS_ID, { cookie_expires: 365 * 24 * 60 * 60 });
  const script = document.createElement("script");
  script.id = "aio-analytics-loader";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  document.head.appendChild(script);
}

export function saveCookiePreference(analytics: boolean): boolean {
  memoryPreference = { version: 1, analytics, savedAt: Date.now() };
  let persisted = true;
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(memoryPreference)); }
  catch { persisted = false; }
  applyAnalytics(analytics);
  window.dispatchEvent(new Event(CONSENT_EVENT));
  return persisted;
}

export function initialiseCookieConsent() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  applyAnalytics(readCookiePreference()?.analytics === true);
  window.addEventListener("storage", (event) => {
    if (event.key !== CONSENT_KEY && event.key !== null) return;
    memoryPreference = null;
    applyAnalytics(readCookiePreference()?.analytics === true);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  });
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}
