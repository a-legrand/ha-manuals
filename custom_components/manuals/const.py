"""Constants for the Manuals integration."""

DOMAIN = "manuals"

STORAGE_KEY = f"{DOMAIN}.data"
STORAGE_VERSION = 1

# Uploaded files live under <config>/manuals/<manual_id>/<file_id>.
FILES_DIR = DOMAIN

# Sidebar panel.
PANEL_URL_PATH = "manuals"
PANEL_TITLE = "Manuals"
# Custom panel titles are not translated by the frontend: picked from the
# server language when the panel is registered.
PANEL_TITLES = {"en": PANEL_TITLE, "fr": "Notices"}
PANEL_ICON = "mdi:book-open-variant"

# Static URL serving the built frontend (panel + Lovelace card).
STATIC_URL = f"/{DOMAIN}_static"
PANEL_JS = "manuals-panel.js"
CARD_JS = "manuals-card.js"

# HTTP API.
URL_UPLOAD = f"/api/{DOMAIN}/upload"
URL_FILE = f"/api/{DOMAIN}/file/{{manual_id}}/{{file_id}}"

MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100 MB

# Types accepted for stored files. Served from Home Assistant's origin, so
# nothing that a browser could run as a page (HTML, SVG...).
DOCUMENT_TYPES = frozenset(
    {"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"}
)
