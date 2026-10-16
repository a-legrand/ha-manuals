"""Tests for the setup, the config flow and the frontend registration."""

from __future__ import annotations

from custom_components.manuals.const import DOMAIN
from custom_components.manuals.store import ManualStore
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType


async def test_config_flow(hass: HomeAssistant, config_dir) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Manuals"


async def test_single_instance(hass: HomeAssistant, store: ManualStore) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_panel_and_card(hass: HomeAssistant, store: ManualStore) -> None:
    panel = hass.data[DATA_PANELS]["manuals"]
    # The URL changes with the build: browsers never keep a stale panel.
    assert panel.config["_panel_custom"]["module_url"].startswith(
        "/manuals_static/manuals-panel.js?v="
    )
    assert panel.sidebar_title == "Manuals"


async def test_unload_and_reload(hass: HomeAssistant, store: ManualStore) -> None:
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    manual = store.async_create(title="Kept")

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert "manuals" not in hass.data[DATA_PANELS]

    # Saved data survives an unload.
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert manual.id in hass.data[DOMAIN].manuals
    assert "manuals" in hass.data[DATA_PANELS]
