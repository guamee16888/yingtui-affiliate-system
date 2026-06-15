export const DEFAULT_DESKTOP_HOST = "127.0.0.1";
export const DEFAULT_DESKTOP_DEV_EMAIL = "owner@guamee.local";
export const FALLBACK_DESKTOP_URL = "http://127.0.0.1:5288/manager/?desktop=1&appMode=1&devEmail=owner@guamee.local";

export function buildDesktopManagerUrl({ host = DEFAULT_DESKTOP_HOST, port = 5288, devEmail = DEFAULT_DESKTOP_DEV_EMAIL } = {}) {
  const url = new URL(`http://${host}:${port}/manager/`);
  url.searchParams.set("desktop", "1");
  url.searchParams.set("appMode", "1");
  url.searchParams.set("devEmail", devEmail);
  return url.toString();
}

export function resolveDesktopLoadUrl(env = process.env) {
  return env.AI_CREATOR_OS_DESKTOP_URL || FALLBACK_DESKTOP_URL;
}
