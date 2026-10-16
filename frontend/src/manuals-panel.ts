import { mdiDevices, mdiFilterVariant, mdiMenuDown, mdiPencil, mdiPlus, mdiSofaOutline } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type ListFilter,
  type Manual,
  type Route,
  deviceName,
  errorText,
  listIgnoredDevices,
  listManuals,
  navigate,
  showToast,
} from "./api";
import { documentsStyles, renderDocuments } from "./documents";
import { loadHaElements } from "./ha-components";
import { localize } from "./localize";
import { candidateDevices, isBranded, linkedDeviceIds } from "./missing-devices";
import "./missing-devices";
import "./manual-dialog";
import type { ManualDialog } from "./manual-dialog";

const LIST_PATH = "/list";
const DEVICES_PATH = "/devices";

/**
 * Sidebar panel, built with HA's own elements like the Settings pages: tabs
 * "Manuals" / "Devices without manual" (admins), search, area filter, cards,
 * and an "Add" button.
 */
@customElement("manuals-panel")
export class ManualsPanel extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) route?: Route;

  @state() private ready = false;
  @state() private manuals: Manual[] = [];
  @state() private query = "";
  @state() private areaId = "";
  /** Unfiltered, for the devices tab and the counters. */
  @state() private allManuals: Manual[] = [];
  @state() private ignored = new Set<string>();

  @query("manual-dialog") private dialog!: ManualDialog;

  private searchTimer?: number;

  protected async firstUpdated(): Promise<void> {
    await loadHaElements();
    this.ready = true;
    this.refresh();
  }

  private t(key: Parameters<typeof localize>[0], params?: Record<string, string>): string {
    return localize(key, this.hass.language, params);
  }

  private get isAdmin(): boolean {
    return this.hass.user?.is_admin ?? false;
  }

  private get onDevicesTab(): boolean {
    return this.isAdmin && this.route?.path === DEVICES_PATH;
  }

  private async refresh(): Promise<void> {
    const filter: ListFilter = {};
    if (this.query) filter.query = this.query;
    if (this.areaId) filter.area_id = this.areaId;
    let manuals: Manual[], allManuals: Manual[], ignored: string[];
    try {
      [manuals, allManuals, ignored] = await Promise.all([
        listManuals(this.hass, filter),
        listManuals(this.hass),
        this.isAdmin ? listIgnoredDevices(this.hass) : Promise.resolve([]),
      ]);
    } catch (err) {
      showToast(this, this.t("form.error", { message: errorText(err) }));
      return;
    }
    this.manuals = manuals.sort((a, b) => a.title.localeCompare(b.title));
    this.allManuals = allManuals;
    this.ignored = new Set(ignored);
  }

  /** Devices without manual, not ignored, as listed by default (tab counter). */
  private missingCount(): number {
    const linked = linkedDeviceIds(this.allManuals);
    return candidateDevices(this.hass).filter((d) => !linked.has(d.id) && !this.ignored.has(d.id) && isBranded(d))
      .length;
  }

  private onSearch(ev: Event): void {
    this.query = (ev.target as HTMLInputElement).value ?? "";
    clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.refresh(), 250);
  }

  private onArea(ev: CustomEvent<{ item: { value: string } }>): void {
    this.areaId = ev.detail.item.value;
    this.refresh();
  }

  // Search bar like Settings > Integrations: outlined search, filter on the
  // right; in the header on narrow screens.
  private renderSearch() {
    return html`<ha-input-search
      appearance="outlined"
      .value=${this.query}
      .placeholder=${this.t("panel.search")}
      @input=${this.onSearch}
    ></ha-input-search>`;
  }

  private renderAreaFilter() {
    const areas = Object.values(this.hass.areas).sort((a, b) => a.name.localeCompare(b.name));
    const current = this.hass.areas[this.areaId];
    return html`
      <ha-dropdown @wa-select=${this.onArea}>
        ${this.narrow
          ? html`<ha-icon-button
              slot="trigger"
              class=${current ? "active" : ""}
              .path=${mdiFilterVariant}
              .label=${current?.name ?? this.t("panel.all_areas")}
            ></ha-icon-button>`
          : html`<ha-button slot="trigger" appearance="plain" size="s" variant=${current ? "brand" : "neutral"}>
              <ha-svg-icon slot="start" .path=${mdiFilterVariant}></ha-svg-icon>
              ${current?.name ?? this.t("panel.all_areas")}
              <ha-svg-icon slot="end" .path=${mdiMenuDown}></ha-svg-icon>
            </ha-button>`}
        <ha-dropdown-item value="" .selected=${!current}>${this.t("panel.all_areas")}</ha-dropdown-item>
        <wa-divider></wa-divider>
        ${areas.map(
          (a) => html`<ha-dropdown-item value=${a.area_id} .selected=${a.area_id === this.areaId}>
            ${a.icon ? html`<ha-icon slot="icon" .icon=${a.icon}></ha-icon>` : html`<ha-svg-icon slot="icon" .path=${mdiSofaOutline}></ha-svg-icon>`}
            ${a.name}
          </ha-dropdown-item>`,
        )}
      </ha-dropdown>
    `;
  }

  render() {
    if (!this.ready) return nothing;
    const prefix = this.route?.prefix ?? "/manuals";
    // HA marks the first tab whose path prefixes the URL as active: "/manuals"
    // would match "/manuals/devices" too, hence a distinct path for the list.
    const tabs = [
      { path: prefix + LIST_PATH, name: `${this.t("panel.tab_manuals")} (${this.allManuals.length})` },
      ...(this.isAdmin
        ? [{ path: prefix + DEVICES_PATH, name: `${this.t("panel.tab_devices")} (${this.missingCount()})` }]
        : []),
    ];
    const route = { prefix, path: this.onDevicesTab ? DEVICES_PATH : LIST_PATH };
    const dialog = html`<manual-dialog .hass=${this.hass} @manuals-changed=${this.refresh}></manual-dialog>`;

    if (this.onDevicesTab) {
      return html`
        <missing-devices
          .hass=${this.hass}
          .narrow=${this.narrow}
          .route=${route}
          .tabs=${tabs}
          .manuals=${this.allManuals}
          .ignored=${this.ignored}
          @add-manual=${(ev: CustomEvent<string[]>) => this.dialog.open(null, ev.detail)}
          @manuals-changed=${this.refresh}
        ></missing-devices>
        ${dialog}
      `;
    }

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${route}
        .tabs=${tabs}
        main-page
        ?has-fab=${this.isAdmin}
      >
        ${this.narrow
          ? html`<div slot="header" class="header">${this.renderSearch()}</div>
              <div slot="toolbar-icon">${this.renderAreaFilter()}</div>`
          : html`<div class="search">${this.renderSearch()} ${this.renderAreaFilter()}</div>`}
        ${this.manuals.length === 0
          ? html`<p class="empty">${this.t("panel.empty")}</p>`
          : html`<div class="grid">${this.manuals.map((manual) => this.renderManual(manual))}</div>`}
        ${this.isAdmin
          ? html`<ha-button slot="fab" size="l" @click=${() => this.dialog.open(null)}>
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this.t("panel.add")}
            </ha-button>`
          : nothing}
      </hass-tabs-subpage>
      ${dialog}
    `;
  }

  private renderManual(manual: Manual) {
    const devices = manual.device_ids.map((id) => this.hass.devices[id]).filter(Boolean);
    const areas = manual.area_ids.map((id) => this.hass.areas[id]).filter(Boolean);
    const linked = [
      ...devices.map((d) => ({ icon: mdiDevices, name: deviceName(d), path: `/config/devices/device/${d.id}` })),
      ...areas.map((a) => ({ icon: mdiSofaOutline, name: a.name, path: `/config/areas/area/${a.area_id}` })),
    ];
    return html`
      <ha-card outlined>
        <div class="card-header">
          <div class="title">
            <span class="name">${manual.title}</span>
            ${manual.brand || manual.model
              ? html`<span class="secondary">${[manual.brand, manual.model].filter(Boolean).join(" · ")}</span>`
              : nothing}
          </div>
          ${this.isAdmin
            ? html`<ha-icon-button
                .path=${mdiPencil}
                .label=${this.t("panel.edit")}
                @click=${() => this.dialog.open(manual)}
              ></ha-icon-button>`
            : nothing}
        </div>
        ${linked.length || manual.tags.length
          ? html`<div class="linked">
              ${linked.map(
                (l) =>
                  // Device and area pages live under Settings, which only admins can open.
                  html`<a
                    class="link ${this.isAdmin ? "" : "disabled"}"
                    href=${this.isAdmin ? l.path : nothing}
                    @click=${(ev: MouseEvent) => this.isAdmin && navigate(ev, l.path)}
                  >
                    <ha-svg-icon .path=${l.icon}></ha-svg-icon>${l.name}
                  </a>`,
              )}
              ${manual.tags.map((tag) => html`<span class="tag">#${tag}</span>`)}
            </div>`
          : nothing}
        ${renderDocuments(this.hass, manual)}
      </ha-card>
    `;
  }

  static styles = [
    documentsStyles,
    css`
      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }
      hass-tabs-subpage {
        height: 100%;
      }
      .search {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4, 16px);
        height: 56px;
        padding: 0 var(--ha-space-4, 16px);
        position: sticky;
        top: 0;
        z-index: 2;
        box-sizing: border-box;
        background-color: var(--primary-background-color);
        border-bottom: 1px solid var(--divider-color);
      }
      .header {
        display: flex;
        min-width: 0;
      }
      ha-input-search {
        flex: 1;
        min-width: 0;
      }
      ha-icon-button.active {
        color: var(--primary-color);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--ha-space-4, 16px);
        padding: var(--ha-space-4, 16px);
        max-width: 1600px;
        margin: 0 auto;
      }
      .empty {
        text-align: center;
        color: var(--secondary-text-color);
        padding: var(--ha-space-8, 32px) var(--ha-space-4, 16px);
      }
      ha-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--ha-space-2, 8px);
        padding: var(--ha-space-3, 12px) var(--ha-space-2, 8px) 0 var(--ha-space-4, 16px);
      }
      .title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding-top: var(--ha-space-2, 8px);
      }
      .name {
        font-size: var(--ha-font-size-l, 16px);
        font-weight: var(--ha-font-weight-medium, 500);
        line-height: var(--ha-line-height-condensed, 1.2);
        overflow-wrap: anywhere;
      }
      .secondary {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-m, 14px);
        margin-top: var(--ha-space-1, 4px);
      }
      .linked {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
        padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px) 0;
        font-size: var(--ha-font-size-m, 14px);
      }
      .link {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1, 4px);
        color: var(--primary-color);
        text-decoration: none;
        --mdc-icon-size: 18px;
      }
      .link.disabled {
        color: var(--secondary-text-color);
      }
      .tag {
        color: var(--secondary-text-color);
      }
      ha-list-base.documents {
        padding: var(--ha-space-2, 8px) 0;
      }
    `,
  ];
}
