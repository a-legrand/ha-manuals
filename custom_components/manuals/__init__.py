"""Manuals integration: store, browse and search appliance manuals."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from . import frontend, http, websocket_api
from .const import DOMAIN
from .store import ManualStore


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Manuals from a config entry."""
    store = ManualStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = store

    # HTTP views and websocket commands cannot be unregistered: register once.
    if not hass.data.get(f"{DOMAIN}_api_registered"):
        http.async_register(hass)
        websocket_api.async_register(hass)
        hass.data[f"{DOMAIN}_api_registered"] = True

    version = (await async_get_integration(hass, DOMAIN)).version
    await frontend.async_register(hass, str(version))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    frontend.async_unregister(hass)
    store: ManualStore = hass.data.pop(DOMAIN)
    await store.async_flush()
    return True
