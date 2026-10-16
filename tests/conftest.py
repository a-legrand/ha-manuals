"""Fixtures for the Manuals tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.manuals.const import DOMAIN
from custom_components.manuals.store import ManualStore
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

PDF = b"%PDF-1.7\n%test document\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Load the integration from custom_components/."""


@pytest.fixture
def config_dir(hass: HomeAssistant, tmp_path: Path) -> Path:
    """Stored files go to a temporary config directory."""
    hass.config.config_dir = str(tmp_path)
    return tmp_path


@pytest.fixture
async def store(hass: HomeAssistant, config_dir: Path) -> ManualStore:
    """The integration, set up, and its store."""
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="Manuals")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return hass.data[DOMAIN]
