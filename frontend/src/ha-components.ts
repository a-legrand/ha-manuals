import { mdiFileDocumentOutline, mdiFileImageOutline, mdiFilePdfBox, mdiLink } from "@mdi/js";
import type { ManualFile } from "./api";

/** HA frontend elements used by the panel. Most are already loaded by the
 * time a custom panel opens; the others come with the config panel. */
const USED_ELEMENTS = [
  "hass-tabs-subpage",
  "ha-alert",
  "ha-dropdown",
  "ha-dropdown-item",
  "ha-icon",
  "ha-button",
  "ha-card",
  "ha-checkbox",
  "ha-dialog",
  "ha-dialog-footer",
  "ha-icon-button",
  "ha-input",
  "ha-input-search",
  "hass-tabs-subpage-data-table",
  "ha-icon-overflow-menu",
  "ha-assist-chip",
  "ha-list-base",
  "ha-list-item-base",
  "ha-list-item-button",
  "ha-selector",
  "ha-svg-icon",
];

interface PanelResolver extends HTMLElement {
  hass: unknown;
  _updateRoutes(): void;
  routerOptions: { routes: Record<string, { load?: () => Promise<unknown> }> };
}

/**
 * Make sure HA's own elements are defined, so that the panel looks like the
 * rest of the UI. Missing ones are loaded through the config panel, as HA does
 * when opening Settings (they are not public modules).
 */
export async function loadHaElements(): Promise<void> {
  if (USED_ELEMENTS.every((tag) => customElements.get(tag))) return;
  try {
    await customElements.whenDefined("partial-panel-resolver");
    const resolver = document.createElement("partial-panel-resolver") as PanelResolver;
    resolver.hass = { panels: [{ url_path: "tmp", component_name: "config" }] };
    resolver._updateRoutes();
    await resolver.routerOptions.routes.tmp.load?.();
    await customElements.whenDefined("ha-panel-config");
    const config = document.createElement("ha-panel-config") as PanelResolver;
    await Promise.all(["areas", "devices"].map((r) => config.routerOptions.routes[r]?.load?.()));
  } catch (err) {
    console.warn("Manuals: could not load Home Assistant elements", err);
  }
}

/** Icon of a document: link, PDF, image or other file. */
export function fileIcon(f: ManualFile): string {
  if (f.url) return mdiLink;
  if (f.content_type === "application/pdf") return mdiFilePdfBox;
  if (f.content_type.startsWith("image/")) return mdiFileImageOutline;
  return mdiFileDocumentOutline;
}
