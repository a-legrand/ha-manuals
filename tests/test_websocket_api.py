"""Tests for the websocket API."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.manuals.downloader import DownloadError, Probe
from custom_components.manuals.store import ManualStore
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar, device_registry as dr

from .conftest import PDF

WS = "custom_components.manuals.websocket_api"


@pytest.fixture
async def ws(hass: HomeAssistant, store: ManualStore, hass_ws_client):
    """Send a command as an admin, return the whole response."""
    client = await hass_ws_client(hass)

    async def send(type_: str, **fields: Any) -> dict[str, Any]:
        await client.send_json_auto_id({"type": f"manuals/{type_}", **fields})
        return await client.receive_json()

    return send


async def test_crud(ws) -> None:
    created = await ws(
        "create", title=" Boiler ", brand="Saunier Duval", tags=["heating"]
    )
    assert created["success"]
    manual = created["result"]
    assert manual["title"] == "Boiler"  # stripped

    updated = await ws("update", manual_id=manual["id"], model="ThemaPlus")
    assert updated["result"]["model"] == "ThemaPlus"
    assert updated["result"]["brand"] == "Saunier Duval"

    got = await ws("get", manual_id=manual["id"])
    assert got["result"]["model"] == "ThemaPlus"

    assert (await ws("delete", manual_id=manual["id"]))["success"]
    assert (await ws("list"))["result"] == []


@pytest.mark.parametrize("title", ["", "   "])
async def test_blank_title_refused(ws, title: str) -> None:
    assert not (await ws("create", title=title))["success"]

    manual = (await ws("create", title="T"))["result"]
    assert not (await ws("update", manual_id=manual["id"], title=title))["success"]


@pytest.mark.parametrize(
    ("type_", "fields"),
    [
        ("get", {}),
        ("update", {"title": "T"}),
        ("delete", {}),
        ("add_link", {"url": "https://example.com/a.pdf"}),
        ("copy_link", {"url": "https://example.com/a.pdf"}),
        ("remove_file", {"file_id": "f"}),
    ],
)
async def test_unknown_manual(ws, type_: str, fields: dict[str, Any]) -> None:
    response = await ws(type_, manual_id="missing", **fields)
    assert response["error"]["code"] == "not_found"


async def test_list_filters(hass: HomeAssistant, ws) -> None:
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    kitchen = ar.async_get(hass).async_create("Kitchen")
    device_reg = dr.async_get(hass)
    oven = device_reg.async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "oven")}
    )
    device_reg.async_update_device(oven.id, area_id=kitchen.id)

    by_device = (await ws("create", title="Oven", device_ids=[oven.id]))["result"]
    by_area = (await ws("create", title="Hood", area_ids=[kitchen.id]))["result"]
    await ws("create", title="Électrique", notes="Salon")

    def titles(response: dict[str, Any]) -> set[str]:
        return {m["title"] for m in response["result"]}

    assert titles(await ws("list", device_id=oven.id)) == {by_device["title"]}
    # Linked to the area directly, or through a device located in it.
    assert titles(await ws("list", area_id=kitchen.id)) == {"Oven", by_area["title"]}
    assert titles(await ws("list", query="electrique salon")) == {"Électrique"}
    device_reg.async_update_device(oven.id, name_by_user="Built-in oven")
    assert titles(await ws("list", query="built-in")) == {"Oven"}
    # Area linked directly, or through a linked device.
    assert titles(await ws("list", query="kitchen")) == {"Oven", "Hood"}


async def test_add_link(ws) -> None:
    manual = (await ws("create", title="T"))["result"]

    link = await ws(
        "add_link", manual_id=manual["id"], url="https://example.com/doc/a.pdf"
    )
    assert link["result"]["filename"] == "a.pdf"
    assert link["result"]["url"] == "https://example.com/doc/a.pdf"

    named = await ws(
        "add_link", manual_id=manual["id"], url="https://example.com", label="Site"
    )
    assert named["result"]["filename"] == "Site"


@pytest.mark.parametrize("url", ["javascript:alert(1)", "file:///etc/passwd", "nope"])
async def test_add_link_refuses_other_schemes(ws, url: str) -> None:
    manual = (await ws("create", title="T"))["result"]
    assert not (await ws("add_link", manual_id=manual["id"], url=url))["success"]


async def test_remove_file(ws, store: ManualStore) -> None:
    manual = (await ws("create", title="T"))["result"]
    file = await store.async_add_file(manual["id"], "a.pdf", PDF)

    assert (await ws("remove_file", manual_id=manual["id"], file_id=file.id))["success"]
    response = await ws(
        "remove_file", manual_id=manual["id"], file_id="../../secrets.yaml"
    )
    assert response["error"]["code"] == "not_found"


async def test_ignored_devices(ws) -> None:
    await ws("set_device_ignored", device_id="b", ignored=True)
    await ws("set_device_ignored", device_id="a", ignored=True)
    assert (await ws("ignored_devices"))["result"] == ["a", "b"]

    await ws("set_device_ignored", device_id="a", ignored=False)
    assert (await ws("ignored_devices"))["result"] == ["b"]


async def test_probe_and_copy_link(ws) -> None:
    """Fetching itself is covered by test_downloader."""
    url = "https://example.com/files/manual.pdf"
    probe = Probe(url, "application/pdf", len(PDF), "manual.pdf", True)
    manual = (await ws("create", title="T"))["result"]

    with patch(f"{WS}.async_probe", return_value=probe):
        assert (await ws("probe_url", url=url))["result"]["is_document"]

    with patch(f"{WS}.async_download", return_value=(probe, PDF)):
        file = (await ws("copy_link", manual_id=manual["id"], url=url))["result"]
    assert file["content_type"] == "application/pdf"
    assert file["filename"] == "manual.pdf"
    assert file["source_url"] == url
    assert file["url"] is None


async def test_copy_link_refuses_disguised_content(ws) -> None:
    """The headers said PDF, the content is a web page."""
    url = "https://example.com/manual.pdf"
    probe = Probe(url, "application/pdf", None, "manual.pdf", True)
    manual = (await ws("create", title="T"))["result"]

    with patch(f"{WS}.async_download", return_value=(probe, b"<html></html>")):
        response = await ws("copy_link", manual_id=manual["id"], url=url)
    assert response["error"]["code"] == "not_document"


async def test_download_errors_are_forwarded(ws) -> None:
    manual = (await ws("create", title="T"))["result"]
    error = DownloadError("too_large", "> 100 MB")

    with patch(f"{WS}.async_download", side_effect=error):
        response = await ws(
            "copy_link", manual_id=manual["id"], url="https://example.com"
        )
    assert response["error"] == {"code": "too_large", "message": "> 100 MB"}

    with patch(f"{WS}.async_probe", side_effect=error):
        response = await ws("probe_url", url="https://example.com")
    assert response["error"]["code"] == "too_large"


async def test_non_admin(
    hass: HomeAssistant,
    store: ManualStore,
    hass_ws_client,
    hass_read_only_access_token: str,
) -> None:
    """Every user can read; only admins can change anything."""
    manual = store.async_create(title="T")
    client = await hass_ws_client(hass, hass_read_only_access_token)

    async def send(type_: str, **fields: Any) -> dict[str, Any]:
        await client.send_json_auto_id({"type": f"manuals/{type_}", **fields})
        return await client.receive_json()

    assert (await send("list"))["success"]
    assert (await send("get", manual_id=manual.id))["success"]
    for type_, fields in (
        ("create", {"title": "T"}),
        ("update", {"manual_id": manual.id, "title": "X"}),
        ("delete", {"manual_id": manual.id}),
        ("add_link", {"manual_id": manual.id, "url": "https://example.com"}),
        ("probe_url", {"url": "https://example.com"}),
        ("remove_file", {"manual_id": manual.id, "file_id": "f"}),
        ("set_device_ignored", {"device_id": "d", "ignored": True}),
    ):
        response = await send(type_, **fields)
        assert response["error"]["code"] == "unauthorized", type_
