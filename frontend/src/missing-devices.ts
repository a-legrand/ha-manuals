import { mdiEye, mdiEyeOffOutline, mdiFilterVariant, mdiLinkVariant, mdiOpenInNew, mdiPlus } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type DeviceEntry,
  type HomeAssistant,
  type Manual,
  type Route,
  deviceName,
  errorText,
  navigateTo,
  sameModel,
  setDeviceIgnored,
  showToast,
  updateManual,
} from "./api";
import { localize } from "./localize";

/** Devices that may need a manual: enabled devices, not services. */
export const candidateDevices = (hass: HomeAssistant): DeviceEntry[] =>
  Object.values(hass.devices).filter((d) => d.entry_type !== "service" && !d.disabled_by);

/** Physical appliances nearly always have a manufacturer or a model; virtual
 * devices (helpers, demo, groups...) usually have neither. */
export const isBranded = (d: DeviceEntry) => !!(d.manufacturer || d.model);

/** Ids of the devices linked to at least one manual. */
export const linkedDeviceIds = (manuals: Manual[]): Set<string> => new Set(manuals.flatMap((manual) => manual.device_ids));

interface Row {
  id: string;
  name: string;
  area: string;
  manufacturer: string;
  model: string;
  ignored: boolean;
  /** Manual already used by a device of the same brand and model. */
  suggestion?: Manual;
  suggestion_title: string;
}

/**
 * "Devices without manual" tab: a HA data table like Settings > Devices
 * (search, sort, group by area, multi-selection). Fires `add-manual` (detail:
 * device ids) to open the form, and `manuals-changed` after a change.
 */
@customElement("missing-devices")
export class MissingDevices extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) route!: Route;
  @property({ attribute: false }) tabs: { path: string; name: string }[] = [];
  /** All manuals, unfiltered. */
  @property({ attribute: false }) manuals: Manual[] = [];
  @property({ attribute: false }) ignored = new Set<string>();

  @state() private filter = "";
  @state() private selected: string[] = [];
  @state() private showIgnored = false;
  @state() private showUnbranded = false;

  private t(key: Parameters<typeof localize>[0], params?: Record<string, string>): string {
    return localize(key, this.hass.language, params);
  }

  private manualForSameModel(d: DeviceEntry): Manual | undefined {
    return this.manuals.find(
      (manual) =>
        sameModel(d, manual.brand, manual.model) ||
        manual.device_ids.some((id) => {
          const other = this.hass.devices[id];
          return other && sameModel(d, other.manufacturer ?? "", other.model ?? "");
        }),
    );
  }

  private rows(): Row[] {
    const linked = linkedDeviceIds(this.manuals);
    return candidateDevices(this.hass)
      .filter((d) => !linked.has(d.id))
      .filter((d) => this.showIgnored || !this.ignored.has(d.id))
      .filter((d) => this.showUnbranded || isBranded(d))
      .map((d) => {
        const suggestion = this.manualForSameModel(d);
        return {
          id: d.id,
          name: deviceName(d),
          area: (d.area_id && this.hass.areas[d.area_id]?.name) || this.t("form.no_area"),
          manufacturer: d.manufacturer ?? "",
          model: d.model ?? "",
          ignored: this.ignored.has(d.id),
          suggestion,
          suggestion_title: suggestion?.title ?? "",
        };
      });
  }

  private columns() {
    return {
      name: {
        title: this.t("devices.col_device"),
        main: true,
        sortable: true,
        filterable: true,
        direction: "asc",
        grows: true,
        flex: 2,
        minWidth: "150px",
        extraTemplate: (row: Row) =>
          // Rendered inside the table's shadow root: inline style.
          row.ignored
            ? html`<div style="color: var(--secondary-text-color)">${this.t("devices.ignored")}</div>`
            : nothing,
      },
      area: {
        title: this.t("devices.col_area"),
        groupable: true,
        filterable: true,
        sortable: true,
        minWidth: "120px",
      },
      manufacturer: {
        title: this.t("devices.col_manufacturer"),
        groupable: true,
        filterable: true,
        sortable: true,
        minWidth: "120px",
      },
      model: {
        title: this.t("devices.col_model"),
        groupable: true,
        filterable: true,
        sortable: true,
        minWidth: "120px",
      },
      suggestion_title: {
        title: this.t("devices.col_suggestion"),
        filterable: true,
        sortable: true,
        // Too wide for phones: the row menu has the same action.
        hidden: this.narrow,
        minWidth: "300px",
        template: (row: Row) =>
          row.suggestion
            ? html`<ha-button
                appearance="plain"
                size="s"
                @click=${(ev: Event) => {
                  ev.stopPropagation();
                  this.link(row.suggestion!, [row.id]);
                }}
              >
                <ha-svg-icon slot="start" .path=${mdiLinkVariant}></ha-svg-icon>
                ${this.t("devices.link_to", { title: row.suggestion.title })}
              </ha-button>`
            : "—",
      },
      actions: {
        title: "",
        label: this.t("devices.col_actions"),
        type: "overflow-menu",
        showNarrow: true,
        lastFixed: true,
        template: (row: Row) => html`
          <ha-icon-overflow-menu
            narrow
            .hass=${this.hass}
            .items=${[
              ...(row.suggestion
                ? [
                    {
                      path: mdiLinkVariant,
                      label: this.t("devices.link_to", { title: row.suggestion.title }),
                      action: () => this.link(row.suggestion!, [row.id]),
                    },
                  ]
                : []),
              { path: mdiPlus, label: this.t("devices.add_manual"), action: () => this.addManual([row.id]) },
              { path: mdiOpenInNew, label: this.t("devices.open_device"), action: () => navigateTo(`/config/devices/device/${row.id}`) },
              row.ignored
                ? { path: mdiEye, label: this.t("devices.unignore"), action: () => this.setIgnored([row.id], false) }
                : { path: mdiEyeOffOutline, label: this.t("devices.ignore"), action: () => this.setIgnored([row.id], true) },
            ]}
          ></ha-icon-overflow-menu>
        `,
      },
    };
  }

  // -- Actions --------------------------------------------------------------

  private async link(manual: Manual, deviceIds: string[]): Promise<void> {
    await this.run(() =>
      updateManual(this.hass, manual.id, { device_ids: [...new Set([...manual.device_ids, ...deviceIds])] }),
    );
  }

  private async setIgnored(deviceIds: string[], ignored: boolean): Promise<void> {
    await this.run(async () => {
      for (const id of deviceIds) await setDeviceIgnored(this.hass, id, ignored);
    });
  }

  /** Run a change, then refresh; a failure is shown in HA's toast. */
  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (err) {
      showToast(this, this.t("form.error", { message: errorText(err) }));
    }
    this.changed();
  }

  private addManual(deviceIds: string[]): void {
    this.dispatchEvent(new CustomEvent("add-manual", { detail: deviceIds, bubbles: true, composed: true }));
  }

  private changed(): void {
    this.dispatchEvent(new CustomEvent("manuals-changed", { bubbles: true, composed: true }));
  }

  /** Manual of the same model shared by every selected device, if any. */
  private commonSuggestion(rows: Row[]): Manual | undefined {
    const selected = rows.filter((r) => this.selected.includes(r.id));
    const first = selected[0]?.suggestion;
    return first && selected.every((r) => r.suggestion?.id === first.id) ? first : undefined;
  }

  // -- Rendering ------------------------------------------------------------

  render() {
    const rows = this.rows();
    const common = this.commonSuggestion(rows);
    const selectedIgnored = rows.filter((r) => this.selected.includes(r.id) && r.ignored).length;
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .tabs=${this.tabs}
        main-page
        .columns=${this.columns()}
        .data=${rows}
        .filter=${this.filter}
        .searchLabel=${this.t("devices.search", { count: String(rows.length) })}
        .noDataText=${this.t("devices.empty")}
        .initialGroupColumn=${"area"}
        .initialSorting=${{ column: "name", direction: "asc" }}
        selectable
        .selected=${this.selected.length}
        clickable
        has-fab
        @search-changed=${(ev: CustomEvent<{ value: string }>) => (this.filter = ev.detail.value)}
        @selection-changed=${(ev: CustomEvent<{ value: string[] }>) => (this.selected = ev.detail.value)}
        @row-click=${(ev: CustomEvent<{ id: string }>) => this.addManual([ev.detail.id])}
      >
        ${this.renderDisplayMenu()}

        <ha-assist-chip
          slot="selection-bar"
          .label=${this.t("devices.add_manual")}
          @click=${() => this.addManual(this.selected)}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-assist-chip>
        ${common
          ? html`<ha-assist-chip
              slot="selection-bar"
              .label=${this.t("devices.link_to", { title: common.title })}
              @click=${() => this.link(common, this.selected)}
            >
              <ha-svg-icon slot="icon" .path=${mdiLinkVariant}></ha-svg-icon>
            </ha-assist-chip>`
          : nothing}
        <ha-assist-chip
          slot="selection-bar"
          .label=${this.t(selectedIgnored ? "devices.unignore" : "devices.ignore")}
          @click=${() => this.setIgnored(this.selected, !selectedIgnored)}
        >
          <ha-svg-icon slot="icon" .path=${selectedIgnored ? mdiEye : mdiEyeOffOutline}></ha-svg-icon>
        </ha-assist-chip>

        <ha-button slot="fab" size="l" @click=${() => this.addManual([])}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.t("panel.add")}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `;
  }

  /** Which devices to list: also ignored ones, devices without brand or model. */
  private renderDisplayMenu() {
    const active = this.showIgnored || this.showUnbranded;
    return html`
      <ha-dropdown
        slot="toolbar-icon"
        @wa-select=${(ev: CustomEvent<{ item: { value: string } }>) => {
          if (ev.detail.item.value === "ignored") this.showIgnored = !this.showIgnored;
          if (ev.detail.item.value === "unbranded") this.showUnbranded = !this.showUnbranded;
        }}
      >
        <ha-icon-button
          slot="trigger"
          class=${active ? "active" : ""}
          .path=${mdiFilterVariant}
          .label=${this.t("devices.display")}
        ></ha-icon-button>
        <ha-dropdown-item type="checkbox" value="ignored" .checked=${this.showIgnored}>
          ${this.t("devices.show_ignored", { count: String(this.ignored.size) })}
        </ha-dropdown-item>
        <ha-dropdown-item type="checkbox" value="unbranded" .checked=${this.showUnbranded}>
          ${this.t("devices.show_unbranded")}
        </ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    hass-tabs-subpage-data-table {
      height: 100%;
    }
    ha-icon-button.active {
      color: var(--primary-color);
    }
  `;
}
