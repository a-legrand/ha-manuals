import { mdiDeleteOutline, mdiDownload, mdiOpenInNew, mdiPlus, mdiTrayArrowUp } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type DeviceEntry,
  type HomeAssistant,
  type Manual,
  type ManualFile,
  type UrlProbe,
  DOCUMENT_TYPES,
  SEARCH_ENGINES,
  addLink,
  copyLink,
  createManual,
  deleteManual,
  deviceName,
  formatSize,
  getManual,
  isValidUrl,
  manualQuery,
  probeUrl,
  removeFile,
  sameModel,
  updateManual,
  uploadFile,
} from "./api";
import { fileDetails, hostOf } from "./documents";
import { fileIcon } from "./ha-components";
import { localize } from "./localize";

interface Draft {
  title: string;
  brand: string;
  model: string;
  tags: string;
  notes: string;
}

type Field = keyof Draft;

interface PendingLink {
  url: string;
  /** Download a copy instead of keeping a link. */
  copy: boolean;
  /** undefined while checking; null if unreachable. */
  probe?: UrlProbe | null;
}

const EMPTY_DRAFT: Draft = { title: "", brand: "", model: "", tags: "", notes: "" };

/** Short name for a link: last path segment, or the host. */
const urlLabel = (url: string) => {
  const { pathname, host } = new URL(url);
  return decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "") || host;
};

/**
 * Create/edit form, a HA dialog like the area or label ones. Fires
 * `manuals-changed` after a save or a delete.
 *
 * Devices come first: on creation, the first selected device pre-fills brand,
 * model and title.
 */
@customElement("manual-dialog")
export class ManualDialog extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;

  @state() private opened = false;
  @state() private confirmDelete = false;
  @state() private manual: Manual | null = null;
  @state() private draft: Draft = EMPTY_DRAFT;
  /** Fields filled from a device, not typed by the user: may be overwritten. */
  @state() private autoFilled = new Set<Field>();
  @state() private deviceIds: string[] = [];
  @state() private areaIds: string[] = [];
  @state() private pendingFiles: File[] = [];
  @state() private pendingLinks: PendingLink[] = [];
  /** Existing links to replace by a local copy on save. */
  @state() private copyFileIds = new Set<string>();
  @state() private linkInput = "";
  @state() private linkError = "";
  @state() private removedFileIds = new Set<string>();
  @state() private saving = false;
  @state() private error = "";
  /** Form state when opened, to tell whether something was changed. */
  private initialState = "";

  /** Open the dialog, empty (`null`) or to edit `manual`. A new manual can
   * start with devices selected (pre-filling the form from the first one). */
  open(manual: Manual | null, deviceIds: string[] = []): void {
    this.manual = manual;
    this.draft = manual
      ? {
          title: manual.title,
          brand: manual.brand,
          model: manual.model,
          tags: manual.tags.join(", "),
          notes: manual.notes,
        }
      : EMPTY_DRAFT;
    this.autoFilled = new Set();
    this.deviceIds = [...(manual?.device_ids ?? [])];
    this.areaIds = [...(manual?.area_ids ?? [])];
    this.pendingFiles = [];
    this.pendingLinks = [];
    this.copyFileIds = new Set();
    this.linkInput = "";
    this.linkError = "";
    this.removedFileIds = new Set();
    this.error = "";
    this.confirmDelete = false;
    if (!manual && deviceIds.length) this.setDevices(deviceIds);
    this.initialState = this.formState();
    this.opened = true;
  }

  private formState(): string {
    return JSON.stringify([
      this.draft,
      this.deviceIds,
      this.areaIds,
      this.pendingFiles.length,
      this.pendingLinks.length,
      [...this.copyFileIds],
      [...this.removedFileIds],
    ]);
  }

  private t(key: Parameters<typeof localize>[0], params?: Record<string, string>): string {
    return localize(key, this.hass.language, params);
  }

  private close(): void {
    this.opened = false;
  }

  private setField(field: Field) {
    return (ev: Event) => {
      // ha-selector fires value-changed; ha-input fires input.
      const value = (ev as CustomEvent).detail?.value ?? (ev.target as HTMLInputElement).value ?? "";
      this.draft = { ...this.draft, [field]: value };
      if (this.autoFilled.has(field)) {
        this.autoFilled = new Set([...this.autoFilled].filter((f) => f !== field));
      }
    };
  }

  // -- Devices --------------------------------------------------------------

  private setDevices(ids: string[]): void {
    this.deviceIds = ids;
    if (!this.manual) this.prefill();
  }

  /** Fill empty (or previously auto-filled) fields from the first selected device. */
  private prefill(): void {
    const device = this.hass.devices[this.deviceIds[0]];
    const values: Partial<Draft> = device
      ? {
          brand: device.manufacturer ?? "",
          model: device.model ?? "",
          title: [device.manufacturer, device.model].filter(Boolean).join(" ") || deviceName(device),
        }
      : { brand: "", model: "", title: "" };

    const draft = { ...this.draft };
    const autoFilled = new Set(this.autoFilled);
    for (const [field, value] of Object.entries(values) as [Field, string][]) {
      if (draft[field] && !autoFilled.has(field)) continue; // typed by the user
      draft[field] = value;
      if (value) autoFilled.add(field);
      else autoFilled.delete(field);
    }
    this.draft = draft;
    this.autoFilled = autoFilled;
  }

  /** Unselected devices of the same manufacturer + model as a selected one. */
  private similarDevices(): DeviceEntry[] {
    const selected = this.deviceIds.map((id) => this.hass.devices[id]).filter(Boolean);
    return Object.values(this.hass.devices).filter(
      (d) => !this.deviceIds.includes(d.id) && selected.some((s) => sameModel(d, s.manufacturer ?? "", s.model ?? "")),
    );
  }

  // -- Save / delete --------------------------------------------------------

  private async save(): Promise<void> {
    const title = this.draft.title.trim();
    if (!title) {
      this.error = this.t("form.title_required");
      return;
    }
    const fields = {
      title,
      brand: this.draft.brand.trim(),
      model: this.draft.model.trim(),
      tags: this.draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: this.draft.notes,
      device_ids: this.deviceIds,
      area_ids: this.areaIds,
    };

    this.saving = true;
    this.error = "";
    try {
      // Once created, a failure below must not create the manual again on the
      // next save: switch to editing it, and drop pending items already done.
      this.manual = this.manual
        ? await updateManual(this.hass, this.manual.id, fields)
        : await createManual(this.hass, fields);
      const id = this.manual.id;
      for (const fileId of this.removedFileIds) {
        await removeFile(this.hass, id, fileId);
        this.removedFileIds = new Set([...this.removedFileIds].filter((f) => f !== fileId));
      }
      while (this.pendingFiles.length) {
        await uploadFile(this.hass, id, this.pendingFiles[0]);
        this.pendingFiles = this.pendingFiles.slice(1);
      }
      // A failed copy is not retried: the document stays a link.
      while (this.pendingLinks.length) {
        const link = this.pendingLinks[0];
        if (link.copy) {
          await copyLink(this.hass, id, link.url).catch((err) => {
            this.updateLink(link, { copy: false });
            throw err;
          });
        } else {
          await addLink(this.hass, id, link.url);
        }
        this.pendingLinks = this.pendingLinks.slice(1);
      }
      for (const fileId of this.copyFileIds) {
        const url = this.manual.files.find((f) => f.id === fileId)?.url;
        this.copyFileIds = new Set([...this.copyFileIds].filter((f) => f !== fileId));
        if (url) {
          await copyLink(this.hass, id, url);
          await removeFile(this.hass, id, fileId);
        }
      }
      this.changed();
      this.close();
    } catch (err) {
      this.error = this.errorMessage(err);
      if (this.manual) {
        this.changed();
        this.manual = await getManual(this.hass, this.manual.id).catch(() => this.manual);
      }
    } finally {
      this.saving = false;
    }
  }

  private errorMessage(err: unknown): string {
    const { code, message, filename } = err as { code?: string; message?: string; filename?: string };
    if (code === "unsupported_type") return this.t("form.upload_unsupported", { name: filename ?? "" });
    const known = {
      not_document: "form.copy_not_document",
      too_large: "form.copy_too_large",
      download_failed: "form.copy_failed",
    } as const;
    if (code && code in known) return this.t(known[code as keyof typeof known], { message: message ?? "" });
    return this.t("form.error", { message: message ?? String(err) });
  }

  private async delete(): Promise<void> {
    if (!this.manual) return;
    this.saving = true;
    try {
      await deleteManual(this.hass, this.manual.id);
      this.confirmDelete = false;
      this.changed();
      this.close();
    } catch (err) {
      this.confirmDelete = false;
      this.error = this.errorMessage(err);
    } finally {
      this.saving = false;
    }
  }

  private changed(): void {
    this.dispatchEvent(new CustomEvent("manuals-changed", { bubbles: true, composed: true }));
  }

  // -- Documents ------------------------------------------------------------

  private onFilesPicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pendingFiles = [...this.pendingFiles, ...(input.files ?? [])];
    input.value = "";
  }

  private async addPendingLink(): Promise<void> {
    const url = this.linkInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      this.linkError = this.t("form.link_invalid");
      return;
    }
    const known = [...this.pendingLinks.map((l) => l.url), ...(this.manual?.files ?? []).map((f) => f.url ?? f.source_url)];
    if (known.includes(url)) {
      this.linkError = this.t("form.link_duplicate");
      return;
    }
    const link: PendingLink = { url, copy: false };
    this.pendingLinks = [...this.pendingLinks, link];
    this.linkInput = "";
    this.linkError = "";
    // A PDF or an image is copied by default: the manufacturer's site may move
    // or drop it. A web page can only be kept as a link.
    const probe = await probeUrl(this.hass, url).catch(() => null);
    this.updateLink(link, { probe, copy: !!probe?.is_document });
  }

  private updateLink(link: PendingLink, changes: Partial<PendingLink>): void {
    this.pendingLinks = this.pendingLinks.map((l) => (l.url === link.url ? { ...l, ...changes } : l));
  }

  // -- Rendering ------------------------------------------------------------

  render() {
    const similar = this.similarDevices();
    return html`
      <ha-dialog
        .hass=${this.hass}
        .open=${this.opened}
        width="large"
        header-title=${this.t(this.manual ? "form.edit_title" : "form.new_title")}
        .preventScrimClose=${this.formState() !== this.initialState}
        @closed=${this.onClosed}
      >
        ${this.error ? html`<ha-alert class="error" alert-type="error">${this.error}</ha-alert>` : nothing}
        <div class="columns">
          <div class="column">
            <h3>${this.t("form.devices")}</h3>
            <ha-selector
              .hass=${this.hass}
              .required=${false}
              .selector=${{ device: { multiple: true } }}
              .value=${this.deviceIds}
              @value-changed=${(ev: CustomEvent<{ value?: string[] }>) => this.setDevices(ev.detail.value ?? [])}
            ></ha-selector>
            ${similar.length
              ? html`<ha-alert alert-type="info">
                  ${this.t("form.similar", { names: similar.map(deviceName).join(", ") })}
                  <ha-button
                    slot="action"
                    appearance="plain"
                    size="s"
                    @click=${() => this.setDevices([...this.deviceIds, ...similar.map((d) => d.id)])}
                  >
                    ${this.t("form.similar_add")}
                  </ha-button>
                </ha-alert>`
              : nothing}

            <ha-selector
              .hass=${this.hass}
              .required=${false}
              .selector=${{ area: { multiple: true } }}
              .value=${this.areaIds}
              .label=${this.t("form.areas")}
              @value-changed=${(ev: CustomEvent<{ value?: string[] }>) => (this.areaIds = ev.detail.value ?? [])}
            ></ha-selector>

            <ha-selector
              class="notes"
              .hass=${this.hass}
              .required=${false}
              .selector=${{ text: { multiline: true } }}
              .value=${this.draft.notes}
              .label=${this.t("form.notes")}
              @value-changed=${this.setField("notes")}
            ></ha-selector>
          </div>

          <div class="column">
            <h3>${this.t("form.manual")}</h3>
            <ha-input
              .label=${this.t("form.title")}
              .value=${this.draft.title}
              .validationMessage=${this.t("form.title_required")}
              auto-validate
              required
              @input=${this.setField("title")}
            ></ha-input>
            <div class="row">
              <ha-input .label=${this.t("form.brand")} .value=${this.draft.brand} @input=${this.setField("brand")}></ha-input>
              <ha-input .label=${this.t("form.model")} .value=${this.draft.model} @input=${this.setField("model")}></ha-input>
            </div>

            <ha-input
              .label=${this.t("form.tags")}
              .hint=${this.t("form.tags_help")}
              .value=${this.draft.tags}
              @input=${this.setField("tags")}
            ></ha-input>

            <section>
              <h3>${this.t("form.files")}</h3>
              ${this.renderFiles()}
            </section>
          </div>
        </div>

        <ha-dialog-footer slot="footer">
          ${this.manual
            ? html`<ha-button
                slot="secondaryAction"
                class="delete"
                variant="danger"
                appearance="plain"
                .disabled=${this.saving}
                @click=${() => (this.confirmDelete = true)}
              >
                ${this.t("form.delete")}
              </ha-button>`
            : nothing}
          <ha-button slot="secondaryAction" appearance="plain" @click=${this.close}>
            ${this.t("form.cancel")}
          </ha-button>
          <ha-button slot="primaryAction" .loading=${this.saving} @click=${this.save}>
            ${this.t(this.manual ? "form.save" : "form.create")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>

      <ha-dialog
        .hass=${this.hass}
        .open=${this.confirmDelete}
        type="alert"
        width="small"
        header-title=${this.t("form.delete_title")}
        @closed=${(ev: Event) => ev.target === ev.currentTarget && (this.confirmDelete = false)}
      >
        <p>${this.t("form.delete_confirm", { title: this.manual?.title ?? "" })}</p>
        <ha-dialog-footer slot="footer">
          <ha-button slot="secondaryAction" appearance="plain" @click=${() => (this.confirmDelete = false)}>
            ${this.t("form.cancel")}
          </ha-button>
          <ha-button slot="primaryAction" variant="danger" .loading=${this.saving} @click=${this.delete}>
            ${this.t("form.delete")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private onClosed(ev: Event): void {
    // `closed` may also bubble from nested elements (pickers): only handle ours.
    if (ev.target !== ev.currentTarget) return;
    this.opened = false;
    this.manual = null;
  }

  private renderFiles() {
    const existing = (this.manual?.files ?? []).filter((f) => !this.removedFileIds.has(f.id));
    const hasItems = existing.length || this.pendingFiles.length || this.pendingLinks.length;
    return html`
      ${hasItems
        ? html`<ha-list-base class="files">
            ${existing.map((f) => this.renderExistingFile(f))}
            ${this.pendingFiles.map(
              (f, i) => html`
                <ha-list-item-base
                  .headline=${f.name}
                  .supportingText=${`${formatSize(f.size, this.hass.language)} · ${this.t("form.pending")}`}
                >
                  <ha-svg-icon slot="start" .path=${mdiTrayArrowUp}></ha-svg-icon>
                  ${this.removeButton(() => (this.pendingFiles = this.pendingFiles.filter((_, j) => j !== i)))}
                </ha-list-item-base>
              `,
            )}
            ${this.pendingLinks.map((link, i) => this.renderPendingLink(link, i))}
          </ha-list-base>`
        : nothing}

      <div class="add-link">
        <ha-input
          type="url"
          .label=${this.t("form.link_label")}
          placeholder="https://…"
          .value=${this.linkInput}
          .invalid=${!!this.linkError}
          .validationMessage=${this.linkError}
          @input=${(ev: Event) => {
            this.linkInput = (ev.target as HTMLInputElement).value ?? "";
            this.linkError = "";
          }}
          @keydown=${(ev: KeyboardEvent) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              this.addPendingLink();
            }
          }}
        ></ha-input>
        <ha-icon-button
          class="add"
          .path=${mdiPlus}
          .label=${this.t("form.add_link")}
          .disabled=${!this.linkInput.trim()}
          @click=${this.addPendingLink}
        ></ha-icon-button>
      </div>
      ${this.renderWebSearch()}
      <div>
        <ha-button appearance="filled" @click=${this.pickFiles}>
          <ha-svg-icon slot="start" .path=${mdiTrayArrowUp}></ha-svg-icon>
          ${this.t("form.add_files")}
        </ha-button>
        <input type="file" multiple accept=${DOCUMENT_TYPES} @change=${this.onFilesPicked} hidden />
      </div>
    `;
  }

  private pickFiles(): void {
    this.renderRoot.querySelector<HTMLInputElement>("input[type=file]")?.click();
  }

  private removeButton(onClick: () => void) {
    return html`<ha-icon-button
      slot="end"
      .path=${mdiDeleteOutline}
      .label=${this.t("form.remove")}
      @click=${onClick}
    ></ha-icon-button>`;
  }

  private renderExistingFile(f: ManualFile) {
    const toCopy = this.copyFileIds.has(f.id);
    const details = fileDetails(f, this.hass.language);
    return html`
      <ha-list-item-base
        .headline=${f.filename}
        .supportingText=${toCopy ? `${details} · ${this.t("form.pending_copy")}` : details}
      >
        <ha-svg-icon slot="start" .path=${fileIcon(f)}></ha-svg-icon>
        ${f.url
          ? html`
              <ha-icon-button
                slot="end"
                .path=${mdiOpenInNew}
                .label=${this.t("form.open")}
                href=${f.url}
                target="_blank"
                rel="noopener noreferrer"
              ></ha-icon-button>
              ${toCopy
                ? nothing
                : html`<ha-icon-button
                    slot="end"
                    .path=${mdiDownload}
                    .label=${this.t("form.copy_existing")}
                    @click=${() => (this.copyFileIds = new Set([...this.copyFileIds, f.id]))}
                  ></ha-icon-button>`}
            `
          : nothing}
        ${this.removeButton(() => (this.removedFileIds = new Set([...this.removedFileIds, f.id])))}
      </ha-list-item-base>
    `;
  }

  /** Pending link: what it points to, and the "local copy" choice. */
  private renderPendingLink(link: PendingLink, i: number) {
    let details: string;
    if (link.probe === undefined) details = this.t("form.link_checking");
    else if (!link.probe) details = `${hostOf(link.url)} · ${this.t("form.link_unreachable")}`;
    else if (!link.probe.is_document) details = `${hostOf(link.url)} · ${this.t("form.link_page")}`;
    else {
      const kind = link.probe.content_type === "application/pdf" ? "PDF" : this.t("form.image");
      details = [kind, link.probe.size ? formatSize(link.probe.size, this.hass.language) : "", hostOf(link.url)]
        .filter(Boolean)
        .join(" · ");
    }
    return html`
      <ha-list-item-base .headline=${link.probe?.filename || urlLabel(link.url)} .supportingText=${details}>
        <ha-svg-icon slot="start" .path=${link.copy ? mdiDownload : fileIcon({ url: link.url } as ManualFile)}></ha-svg-icon>
        ${link.probe?.is_document
          ? html`<ha-checkbox
              slot="end"
              .checked=${link.copy}
              @change=${(ev: Event) => this.updateLink(link, { copy: (ev.target as HTMLInputElement).checked })}
            >
              ${this.t("form.copy")}
            </ha-checkbox>`
          : nothing}
        ${this.removeButton(() => (this.pendingLinks = this.pendingLinks.filter((_, j) => j !== i)))}
      </ha-list-item-base>
    `;
  }

  /** Buttons opening a web search for the manual, built from brand and model. */
  private renderWebSearch() {
    const terms =
      [this.draft.brand, this.draft.model]
        .map((v) => v.trim())
        .filter(Boolean)
        .join(" ") || this.draft.title.trim();
    if (!terms) return html`<p class="hint">${this.t("form.search_web_hint")}</p>`;
    const q = manualQuery(terms, this.hass.language);
    return html`
      <div class="web-search">
        <span class="hint">${this.t("form.search_web")}</span>
        ${SEARCH_ENGINES.map(
          (e) => html`
            <ha-button appearance="plain" size="s" href=${e.url(q)} target="_blank" rel="noopener noreferrer">
              ${e.name}
              <ha-svg-icon slot="end" .path=${mdiOpenInNew}></ha-svg-icon>
            </ha-button>
          `,
        )}
      </div>
    `;
  }

  static styles = css`
    ha-dialog {
      --ha-dialog-width-lg: 960px;
    }
    /* Two columns on wide screens: devices, areas, notes | details, documents. */
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-6, 24px);
      align-items: start;
      color: var(--primary-text-color);
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4, 16px);
      min-width: 0;
    }
    /* One column on small screens, notes last. */
    @media (max-width: 800px) {
      .columns {
        grid-template-columns: 1fr;
        gap: var(--ha-space-4, 16px);
      }
      .column {
        display: contents;
      }
      .notes {
        order: 1;
      }
    }
    /* Destructive action on the left, away from Cancel / Save. */
    ha-button.delete {
      margin-inline-end: auto;
    }
    ha-alert.error {
      display: block;
      margin-bottom: var(--ha-space-4, 16px);
    }
    ha-selector,
    ha-input {
      display: block;
    }
    .row {
      display: flex;
      gap: var(--ha-space-4, 16px);
    }
    .row ha-input {
      flex: 1;
      min-width: 0;
    }
    @media (max-width: 600px) {
      .row {
        flex-wrap: wrap;
      }
      .row ha-input {
        flex: 1 1 100%;
      }
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
    }
    h3 {
      margin: 0;
      font-size: var(--ha-font-size-l, 16px);
      font-weight: var(--ha-font-weight-bold, 600);
    }
    /* Compact rows: the default ones are sized for full-page lists. */
    ha-list-base.files {
      display: block;
      --ha-row-item-padding-block: var(--ha-space-1, 4px);
      --ha-row-item-min-height: 40px;
      --ha-row-item-gap: var(--ha-space-3, 12px);
      --ha-icon-button-size: 36px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg, 12px);
      overflow: hidden;
    }
    ha-list-base.files ha-icon-button {
      color: var(--secondary-text-color);
    }
    .add-link {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2, 8px);
    }
    .add-link ha-input {
      flex: 1;
    }
    .add-link ha-icon-button.add {
      margin-top: var(--ha-space-1, 4px);
    }
    .web-search {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0 var(--ha-space-1, 4px);
      margin-top: calc(-1 * var(--ha-space-2, 8px));
    }
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
  `;
}
