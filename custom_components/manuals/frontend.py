"""Registration of the sidebar panel and the Lovelace card."""

from __future__ import annotations

import hashlib
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    CARD_JS,
    DOMAIN,
    PANEL_ICON,
    PANEL_JS,
    PANEL_TITLE,
    PANEL_TITLES,
    PANEL_URL_PATH,
    STATIC_URL,
)

FRONTEND_DIR = Path(__file__).parent / "frontend"
CARD_URL_KEY = f"{DOMAIN}_card_url"


def _file_url(name: str, version: str) -> str:
    """URL that changes with the file content, so browsers never keep a stale build."""
    digest = hashlib.sha256((FRONTEND_DIR / name).read_bytes()).hexdigest()[:8]
    return f"{STATIC_URL}/{name}?v={version}-{digest}"


def panel_title(hass: HomeAssistant) -> str:
    """Sidebar title in the server language ("fr", "fr-CA"…), English otherwise."""
    language = hass.config.language.lower()
    return PANEL_TITLES.get(
        language, PANEL_TITLES.get(language.split("-")[0], PANEL_TITLE)
    )


async def async_register(hass: HomeAssistant, version: str) -> None:
    """Serve the built JS, add the sidebar panel and load the card everywhere."""
    panel_url, card_url = await hass.async_add_executor_job(
        lambda: (_file_url(PANEL_JS, version), _file_url(CARD_JS, version))
    )
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
    )

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="manuals-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=panel_url,
        sidebar_title=panel_title(hass),
        sidebar_icon=PANEL_ICON,
        require_admin=False,
    )

    # Makes `custom:manuals-card` available without adding a Lovelace resource.
    frontend.add_extra_js_url(hass, card_url)
    hass.data[CARD_URL_KEY] = card_url


def async_unregister(hass: HomeAssistant) -> None:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    frontend.remove_extra_js_url(hass, hass.data.pop(CARD_URL_KEY))
