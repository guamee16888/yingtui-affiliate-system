export const DESKTOP_STATE_PATH = "data/desktop-state.json";
export const DESKTOP_AUDIT_PATH = "data/audit-logs.json";
export const DESKTOP_X_OAUTH_PATH = "data/desktop-x-oauth.json";
export const DESKTOP_X_CREDENTIALS_PATH = "data/x-credentials.json";
export const DESKTOP_ACCOUNT_TARGET = 100;
export const DESKTOP_ALLOWED_IMPORT_FIELDS = new Set([
  "accountid",
  "handle",
  "lane",
  "laneid",
  "contentlane",
  "country",
  "region",
  "language",
  "status",
  "publishmode",
  "dailypostlimit",
  "externallinklimit",
  "network",
  "networklabel",
  "networknote",
  "ip",
  "ipnote",
  "device",
  "devicenote",
  "countryregionnote",
  "sessionmode",
  "notes",
  "persona",
  "proxyid",
  "proxyurl",
  "fingerprintid",
  "browserprovider",
  "workenvironment",
  "workenv",
  "adsprofileid",
  "adspowerid",
  "adspowerprofileid",
  "adspowerenvironmentid",
  "adsenvironmentid",
  "environmentid"
]);
export const DESKTOP_FORBIDDEN_IMPORT_FIELDS = new Set(["password", "cookie", "cookies", "proxy", "fingerprint", "token", "secret", "timezone"]);
export const DESKTOP_NETWORK_NOTE_FIELDS = new Set(["accountid", "handle", "network", "networklabel", "networknote", "ip", "ipnote", "device", "devicenote", "countryregionnote", "notes"]);
