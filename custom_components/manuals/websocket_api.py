"""Websocket API used by the panel and the Lovelace card."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    config_validation as cv,
    device_registry as dr,
)

from .const import DOMAIN
from .downloader import DownloadError, async_download, async_probe
from .store import (
    FileNotFoundInManualError,
    Manual,
    ManualStore,
    UnsupportedFileError,
)

# Same rule as the form: a title cannot be blank.
TITLE = vol.All(str, vol.Strip, vol.Length(min=1))

MANUAL_FIELDS = {
    vol.Optional("brand"): str,
    vol.Optional("model"): str,
    vol.Optional("tags"): [str],
    vol.Optional("notes"): str,
    vol.Optional("device_ids"): [str],
    vol.Optional("area_ids"): [str],
}


def _store(hass: HomeAssistant) -> ManualStore:
    return hass.data[DOMAIN]


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register websocket commands."""
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_create)
    websocket_api.async_register_command(hass, ws_update)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_add_link)
    websocket_api.async_register_command(hass, ws_probe_url)
    websocket_api.async_register_command(hass, ws_copy_link)
    websocket_api.async_register_command(hass, ws_remove_file)
    websocket_api.async_register_command(hass, ws_ignored_devices)
    websocket_api.async_register_command(hass, ws_set_device_ignored)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/list",
        vol.Optional("device_id"): str,
        vol.Optional("area_id"): str,
        vol.Optional("query"): str,
    }
)
@callback
def ws_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List manuals, optionally filtered by device, area or text query."""
    store = _store(hass)
    manuals = list(store.manuals.values())
    if device_id := msg.get("device_id"):
        manuals = [m for m in manuals if device_id in m.device_ids]
    if area_id := msg.get("area_id"):
        # Linked to the area directly, or to a device located in it.
        dev_reg = dr.async_get(hass)
        area_devices = {d.id for d in dr.async_entries_for_area(dev_reg, area_id)}
        manuals = [
            m
            for m in manuals
            if area_id in m.area_ids or area_devices.intersection(m.device_ids)
        ]
    if query := msg.get("query", "").strip():
        dev_reg = dr.async_get(hass)
        area_reg = ar.async_get(hass)

        def linked_names(manual: Manual) -> list[str]:
            """Names of the linked devices and areas, as shown in Home Assistant.

            Areas include those of the linked devices, as for the area filter.
            """
            devices = list(filter(None, map(dev_reg.async_get, manual.device_ids)))
            area_ids = {*manual.area_ids, *(d.area_id for d in devices if d.area_id)}
            areas = filter(None, map(area_reg.async_get_area, area_ids))
            return [
                *(d.name_by_user or d.name or "" for d in devices),
                *(a.name for a in areas),
            ]

        manuals = [m for m in manuals if m.matches(query, linked_names(m))]
    connection.send_result(msg["id"], [m.to_dict() for m in manuals])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/get", vol.Required("manual_id"): str}
)
@callback
def ws_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    manual = _store(hass).manuals.get(msg["manual_id"])
    if manual is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    connection.send_result(msg["id"], manual.to_dict())


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create",
        vol.Required("title"): TITLE,
        **MANUAL_FIELDS,
    }
)
@websocket_api.require_admin
@callback
def ws_create(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    fields = {k: v for k, v in msg.items() if k not in ("id", "type")}
    manual = _store(hass).async_create(**fields)
    connection.send_result(msg["id"], manual.to_dict())


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update",
        vol.Required("manual_id"): str,
        vol.Optional("title"): TITLE,
        **MANUAL_FIELDS,
    }
)
@websocket_api.require_admin
@callback
def ws_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    store = _store(hass)
    if msg["manual_id"] not in store.manuals:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    fields = {k: v for k, v in msg.items() if k not in ("id", "type", "manual_id")}
    manual = store.async_update(msg["manual_id"], **fields)
    connection.send_result(msg["id"], manual.to_dict())


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete", vol.Required("manual_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    store = _store(hass)
    if msg["manual_id"] not in store.manuals:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    await store.async_delete(msg["manual_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/add_link",
        vol.Required("manual_id"): str,
        # http(s) only: the URL ends up in an <a href>.
        vol.Required("url"): cv.url,
        vol.Optional("label"): str,
    }
)
@websocket_api.require_admin
@callback
def ws_add_link(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Attach a link to a document hosted elsewhere."""
    store = _store(hass)
    if msg["manual_id"] not in store.manuals:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    url: str = msg["url"]
    label = msg.get("label", "").strip() or url.rstrip("/").rsplit("/", 1)[-1] or url
    link = store.async_add_link(msg["manual_id"], url, label)
    connection.send_result(msg["id"], asdict(link))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/probe_url", vol.Required("url"): cv.url}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_probe_url(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Tell whether a URL points to a document (PDF, image) or a web page."""
    try:
        probe = await async_probe(hass, msg["url"])
    except DownloadError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], asdict(probe))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/copy_link",
        vol.Required("manual_id"): str,
        vol.Required("url"): cv.url,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_copy_link(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Download the document at `url` and store it like an uploaded file."""
    store = _store(hass)
    if msg["manual_id"] not in store.manuals:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    try:
        probe, content = await async_download(hass, msg["url"])
    except DownloadError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    try:
        file = await store.async_add_file(
            msg["manual_id"], probe.filename, content, source_url=msg["url"]
        )
    except UnsupportedFileError:
        connection.send_error(msg["id"], "not_document", probe.content_type)
        return
    connection.send_result(msg["id"], asdict(file))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/remove_file",
        vol.Required("manual_id"): str,
        vol.Required("file_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_remove_file(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    store = _store(hass)
    if msg["manual_id"] not in store.manuals:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Manual not found"
        )
        return
    try:
        await store.async_remove_file(msg["manual_id"], msg["file_id"])
    except FileNotFoundInManualError:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "File not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/ignored_devices"})
@callback
def ws_ignored_devices(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Devices hidden from "devices without manual"."""
    connection.send_result(msg["id"], sorted(_store(hass).ignored_device_ids))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_device_ignored",
        vol.Required("device_id"): str,
        vol.Required("ignored"): bool,
    }
)
@websocket_api.require_admin
@callback
def ws_set_device_ignored(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    _store(hass).async_set_device_ignored(msg["device_id"], msg["ignored"])
    connection.send_result(msg["id"])
