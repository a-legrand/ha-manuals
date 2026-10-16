// Minimal subset of the `hass` object passed by Home Assistant to panels/cards.
export interface HomeAssistant {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  /** fetch() with a valid access token, refreshed when expired. */
  fetchWithAuth(path: string, init?: RequestInit): Promise<Response>;
  language: string;
  user?: { is_admin: boolean };
  states: Record<string, { attributes: Record<string, unknown> }>;
  entities?: Record<string, { device_id?: string }>;
  devices: Record<string, DeviceEntry>;
  areas: Record<string, AreaEntry>;
}

export interface DeviceEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  area_id: string | null;
  manufacturer: string | null;
  model: string | null;
  entry_type: string | null;
  disabled_by: string | null;
}

export interface AreaEntry {
  area_id: string;
  name: string;
  icon?: string | null;
}

/** Lowercase, without accents: "Électrique" → "electrique" (same as the backend). */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");

export const deviceName = (d: DeviceEntry) => d.name_by_user || d.name || d.id;

/** Same manufacturer and model as `brand` / `model`, ignoring case and accents. */
export const sameModel = (d: DeviceEntry, brand: string, model: string) =>
  !!d.model && normalize(d.model) === normalize(model) && normalize(d.manufacturer ?? "") === normalize(brand);

/** Route given by HA to a panel. */
export interface Route {
  prefix: string;
  path: string;
}

export interface ManualFile {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  /** Set for a link to a document hosted elsewhere (nothing uploaded). */
  url: string | null;
  /** For a stored file copied from a link: where it was downloaded from. */
  source_url?: string | null;
}

export interface Manual {
  id: string;
  title: string;
  brand: string;
  model: string;
  tags: string[];
  notes: string;
  device_ids: string[];
  area_ids: string[];
  files: ManualFile[];
  created_at: string;
  updated_at: string;
}

export interface ListFilter {
  device_id?: string;
  area_id?: string;
  query?: string;
}

export const listManuals = (hass: HomeAssistant, filter: ListFilter = {}) =>
  hass.callWS<Manual[]>({ type: "manuals/list", ...filter });

export const createManual = (hass: HomeAssistant, fields: Partial<Manual> & { title: string }) =>
  hass.callWS<Manual>({ type: "manuals/create", ...fields });

export const updateManual = (hass: HomeAssistant, manualId: string, fields: Partial<Manual>) =>
  hass.callWS<Manual>({ type: "manuals/update", manual_id: manualId, ...fields });

export const getManual = (hass: HomeAssistant, manualId: string) =>
  hass.callWS<Manual>({ type: "manuals/get", manual_id: manualId });

export const deleteManual = (hass: HomeAssistant, manualId: string) =>
  hass.callWS<void>({ type: "manuals/delete", manual_id: manualId });

export async function uploadFile(hass: HomeAssistant, manualId: string, file: File): Promise<ManualFile> {
  const body = new FormData();
  body.append("manual_id", manualId);
  body.append("file", file);
  const resp = await hass.fetchWithAuth("/api/manuals/upload", { method: "POST", body });
  if (!resp.ok) {
    // Same shape as websocket errors: `code` is translated by the form.
    const { code, message } = await resp.json().catch(() => ({}));
    throw { code, message: message ?? `HTTP ${resp.status}`, filename: file.name };
  }
  return resp.json();
}

/** Accepted by the backend, which checks the content itself. */
export const DOCUMENT_TYPES = "application/pdf,image/png,image/jpeg,image/gif,image/webp";

/** Open a file in a new tab, using a short-lived signed URL (no auth header needed). */
export async function openFile(hass: HomeAssistant, manualId: string, fileId: string): Promise<void> {
  const { path } = await hass.callWS<{ path: string }>({
    type: "auth/sign_path",
    path: `/api/manuals/file/${manualId}/${fileId}`,
    expires: 300,
  });
  window.open(path, "_blank");
}

export const addLink = (hass: HomeAssistant, manualId: string, url: string, label?: string) =>
  hass.callWS<ManualFile>({ type: "manuals/add_link", manual_id: manualId, url, ...(label ? { label } : {}) });

/** http(s) URLs only: anything else is refused by the backend too. */
export function isValidUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** What a URL points to, from its response headers. */
export interface UrlProbe {
  url: string;
  content_type: string;
  size: number | null;
  filename: string;
  /** PDF or image: can be copied locally. Otherwise a web page. */
  is_document: boolean;
}

export const probeUrl = (hass: HomeAssistant, url: string) =>
  hass.callWS<UrlProbe>({ type: "manuals/probe_url", url });

/** Download the document at `url` into the manual (local copy of a link). */
export const copyLink = (hass: HomeAssistant, manualId: string, url: string) =>
  hass.callWS<ManualFile>({ type: "manuals/copy_link", manual_id: manualId, url });

/** Words meaning "user manual", to search the web in the user's language. */
const MANUAL_WORD: Record<string, string> = {
  fr: "notice",
  en: "user manual",
  de: "Bedienungsanleitung",
  es: "manual de usuario",
  it: "manuale d'uso",
  nl: "handleiding",
  pt: "manual do utilizador",
};

/** Web search engines opened in a new tab, prefilled to find a PDF manual. */
export const SEARCH_ENGINES: { name: string; url: (q: string) => string }[] = [
  { name: "Google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { name: "DuckDuckGo", url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  { name: "Qwant", url: (q) => `https://www.qwant.com/?q=${encodeURIComponent(q)}` },
];

/** "Atlantic Divali 1500W manual filetype:pdf" */
export function manualQuery(terms: string, language: string): string {
  const word = MANUAL_WORD[language.toLowerCase().split("-")[0]] ?? MANUAL_WORD.en;
  return `${terms} ${word} filetype:pdf`;
}

/** "2.3 MB", or "2,3 Mo" in French. */
export function formatSize(bytes: number, language: string): string {
  const fr = language.startsWith("fr");
  const [value, unit] =
    bytes < 1024 * 1024 ? [Math.max(1, Math.round(bytes / 1024)), fr ? "ko" : "KB"] : [bytes / 1024 / 1024, fr ? "Mo" : "MB"];
  return `${value.toLocaleString(language, { maximumFractionDigits: 1 })} ${unit}`;
}

export const removeFile = (hass: HomeAssistant, manualId: string, fileId: string) =>
  hass.callWS<void>({ type: "manuals/remove_file", manual_id: manualId, file_id: fileId });

/** Navigate inside the HA frontend (single-page app), like HA's own links. */
export function navigateTo(path: string): void {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
}

/** Click handler of an <a href>: navigates inside HA, unless opened in a new tab. */
export function navigate(ev: MouseEvent, path: string): void {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
  ev.preventDefault();
  navigateTo(path);
}

/** Message of a websocket or HTTP error. */
export const errorText = (err: unknown) => (err as { message?: string })?.message ?? String(err);

/** Show a message in HA's toast at the bottom of the screen. */
export function showToast(el: HTMLElement, message: string): void {
  el.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
}

export const listIgnoredDevices = (hass: HomeAssistant) => hass.callWS<string[]>({ type: "manuals/ignored_devices" });

export const setDeviceIgnored = (hass: HomeAssistant, deviceId: string, ignored: boolean) =>
  hass.callWS<void>({ type: "manuals/set_device_ignored", device_id: deviceId, ignored });
