import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type ListFilter, type Manual, errorText, listManuals } from "./api";
import { documentsStyles, renderDocuments } from "./documents";
import { localize } from "./localize";

interface CardConfig {
  type: string;
  title?: string;
  entity?: string; // resolved to its device (YAML only)
  device_id?: string;
  area?: string;
}

// Lovelace card: manuals of a device (given directly or via one of its
// entities), of an area, or all manuals when no target is set.
//
//   type: custom:manuals-card
//   device_id: 1234abcd…        # or entity: climate.radiateur_chambre_1, or area: chambre
@customElement("manuals-card")
export class ManualsCard extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private config!: CardConfig;
  @state() private manuals: Manual[] = [];
  @state() private error = "";
  private loadedFor?: string;

  static getConfigElement(): HTMLElement {
    return document.createElement("manuals-card-editor");
  }

  /** Default config when added from the card picker: all manuals. */
  static getStubConfig(): Partial<CardConfig> {
    return {};
  }

  setConfig(config: CardConfig): void {
    this.config = config;
    this.loadedFor = undefined;
  }

  getCardSize(): number {
    return 1 + this.manuals.length;
  }

  private filter(): ListFilter {
    if (this.config.device_id) return { device_id: this.config.device_id };
    if (this.config.entity) {
      // Unknown entity or entity without device: matches nothing.
      return { device_id: this.hass.entities?.[this.config.entity]?.device_id ?? "-" };
    }
    if (this.config.area) return { area_id: this.config.area };
    return {};
  }

  protected updated(): void {
    if (this.missingTarget()) return;
    const filter = this.filter();
    const key = JSON.stringify(filter);
    if (key === this.loadedFor) return;
    this.loadedFor = key;
    listManuals(this.hass, filter).then(
      (manuals) => {
        this.manuals = manuals.sort((a, b) => a.title.localeCompare(b.title));
        this.error = "";
      },
      (err) => (this.error = localize("form.error", this.hass.language, { message: errorText(err) })),
    );
  }

  /** Device/area mode chosen in the editor, but no device/area picked yet. */
  private missingTarget(): "card.pick_device" | "card.pick_area" | undefined {
    if (this.config.device_id === "") return "card.pick_device";
    if (this.config.area === "") return "card.pick_area";
    return undefined;
  }

  render() {
    const missing = this.missingTarget();
    const message = this.error || (missing ? localize(missing, this.hass.language) : "");
    return html`
      <ha-card .header=${this.config.title ?? localize("card.title", this.hass.language)}>
        <div class="card-content">
          ${message
            ? html`<p class="empty">${message}</p>`
            : this.manuals.length === 0
            ? html`<p class="empty">${localize("card.empty", this.hass.language)}</p>`
            : this.manuals.map(
                (manual) => html`
                  <div class="manual">
                    <div class="title">${manual.title}</div>
                    ${manual.files.length
                      ? renderDocuments(this.hass, manual)
                      : html`<div class="empty">${localize("card.no_documents", this.hass.language)}</div>`}
                  </div>
                `,
              )}
        </div>
      </ha-card>
    `;
  }

  static styles = [
    documentsStyles,
    css`
      .card-content {
        padding: 0 0 var(--ha-space-2, 8px);
      }
      .manual + .manual {
        margin-top: var(--ha-space-2, 8px);
      }
      .title {
        font-weight: var(--ha-font-weight-medium, 500);
        padding: 0 var(--ha-space-4, 16px);
      }
      .empty {
        color: var(--secondary-text-color);
        padding: var(--ha-space-1, 4px) var(--ha-space-4, 16px);
      }
      p.empty {
        margin: 0;
      }
    `,
  ];
}

type Mode = "all" | "device" | "area";

/** Visual editor, built on HA's `ha-form` and its device/area selectors. */
@customElement("manuals-card-editor")
export class ManualsCardEditor extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private config!: CardConfig;
  /** Kept apart from the config so that "device" stays selected before a device is picked. */
  @state() private mode?: Mode;

  setConfig(config: CardConfig): void {
    this.config = config;
    this.mode ??= config.device_id || config.entity ? "device" : config.area ? "area" : "all";
  }

  private t(key: Parameters<typeof localize>[0]): string {
    return localize(key, this.hass.language);
  }

  private schema(mode: Mode) {
    return [
      {
        name: "mode",
        selector: {
          select: {
            mode: "list",
            options: [
              { value: "all", label: this.t("editor.mode_all") },
              { value: "device", label: this.t("editor.mode_device") },
              { value: "area", label: this.t("editor.mode_area") },
            ],
          },
        },
      },
      ...(mode === "device" ? [{ name: "device_id", selector: { device: {} } }] : []),
      ...(mode === "area" ? [{ name: "area", selector: { area: {} } }] : []),
      { name: "title", selector: { text: {} } },
    ];
  }

  private computeLabel = (field: { name: string }): string =>
    ({
      mode: this.t("editor.mode"),
      device_id: this.t("editor.device"),
      area: this.t("editor.area"),
      title: this.t("editor.title"),
    })[field.name] ?? field.name;

  private valueChanged(ev: CustomEvent): void {
    const { mode, device_id, area, title } = ev.detail.value as { mode: Mode } & Partial<CardConfig>;
    this.mode = mode;
    // Keep only the target matching the mode; drop `entity` once edited visually.
    const config: CardConfig = { type: this.config.type };
    // An empty target makes the card ask for one, instead of showing everything.
    if (mode === "device" && !device_id && this.config.entity) config.entity = this.config.entity;
    else if (mode === "device") config.device_id = device_id ?? "";
    if (mode === "area") config.area = area ?? "";
    if (title) config.title = title;
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  render() {
    if (!this.hass || !this.config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ ...this.config, mode: this.mode }}
        .schema=${this.schema(this.mode ?? "all")}
        .computeLabel=${this.computeLabel}
        @value-changed=${this.valueChanged}
      ></ha-form>
      ${this.config.entity && !this.config.device_id
        ? html`<p class="help">entity: ${this.config.entity}</p>`
        : nothing}
    `;
  }

  static styles = css`
    .help {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
  `;
}

// Listed in the "Add card" dialog.
(window as unknown as { customCards: unknown[] }).customCards ??= [];
(window as unknown as { customCards: unknown[] }).customCards.push({
  type: "manuals-card",
  name: "Manuals",
  description: localize("card.description"),
  preview: true,
  documentationURL: "https://github.com/a-legrand/ha-manuals",
});
