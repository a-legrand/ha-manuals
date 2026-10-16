import { mdiOpenInNew } from "@mdi/js";
import { css, html, nothing } from "lit";
import { type HomeAssistant, type Manual, type ManualFile, formatSize, openFile } from "./api";
import { fileIcon } from "./ha-components";

export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** "PDF · 2.3 MB · www.atlantic.fr" (copy of a link), or the host of a link. */
export function fileDetails(f: ManualFile, language: string): string {
  if (f.url) return hostOf(f.url);
  const kind = f.content_type === "application/pdf" ? "PDF" : f.content_type.startsWith("image/") ? "Image" : "";
  return [kind, f.size ? formatSize(f.size, language) : "", f.source_url ? hostOf(f.source_url) : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Documents of a manual as a HA list: a click opens them in a new tab. */
export function renderDocuments(hass: HomeAssistant, manual: Manual) {
  if (!manual.files.length) return nothing;
  return html`
    <ha-list-base class="documents">
      ${manual.files.map(
        (f) => html`
          <ha-list-item-button
            .headline=${f.filename}
            .supportingText=${fileDetails(f, hass.language)}
            href=${f.url ?? nothing}
            target=${f.url ? "_blank" : nothing}
            rel=${f.url ? "noopener noreferrer" : nothing}
            @click=${f.url ? undefined : () => openFile(hass, manual.id, f.id)}
          >
            <ha-svg-icon slot="start" .path=${fileIcon(f)}></ha-svg-icon>
            <ha-svg-icon slot="end" class="open" .path=${mdiOpenInNew}></ha-svg-icon>
          </ha-list-item-button>
        `,
      )}
    </ha-list-base>
  `;
}

export const documentsStyles = css`
  ha-list-base.documents {
    display: block;
  }
  ha-list-item-button .open {
    color: var(--secondary-text-color);
    --mdc-icon-size: 18px;
  }
`;
