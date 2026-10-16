"""Tests for file upload and download."""

from __future__ import annotations

from http import HTTPStatus

from aiohttp import FormData

from custom_components.manuals.store import ManualFile, ManualStore
from homeassistant.core import HomeAssistant

from .conftest import PDF, PNG


def _form(manual_id: str, content: bytes, filename: str, content_type: str) -> FormData:
    form = FormData()
    form.add_field("manual_id", manual_id)
    form.add_field("file", content, filename=filename, content_type=content_type)
    return form


async def test_upload(store: ManualStore, hass_client) -> None:
    manual = store.async_create(title="T")
    client = await hass_client()

    # The type sent by the browser is ignored: read from the content.
    resp = await client.post(
        "/api/manuals/upload",
        data=_form(manual.id, PDF, "Notice chaudière.pdf", "application/octet-stream"),
    )

    assert resp.status == HTTPStatus.OK
    file = await resp.json()
    assert file["content_type"] == "application/pdf"
    assert file["filename"] == "Notice chaudière.pdf"
    assert [f.id for f in manual.files] == [file["id"]]


async def test_upload_refuses_html(store: ManualStore, hass_client) -> None:
    manual = store.async_create(title="T")
    client = await hass_client()

    resp = await client.post(
        "/api/manuals/upload",
        data=_form(manual.id, b"<script>alert(1)</script>", "page.html", "text/html"),
    )

    assert resp.status == HTTPStatus.UNSUPPORTED_MEDIA_TYPE
    assert (await resp.json())["code"] == "unsupported_type"
    assert manual.files == []


async def test_upload_unknown_manual(store: ManualStore, hass_client) -> None:
    client = await hass_client()
    resp = await client.post(
        "/api/manuals/upload", data=_form("missing", PDF, "a.pdf", "application/pdf")
    )
    assert resp.status == HTTPStatus.BAD_REQUEST


async def test_upload_requires_admin(
    store: ManualStore, hass_client, hass_read_only_access_token: str
) -> None:
    manual = store.async_create(title="T")
    client = await hass_client(hass_read_only_access_token)

    resp = await client.post(
        "/api/manuals/upload", data=_form(manual.id, PDF, "a.pdf", "application/pdf")
    )

    assert resp.status == HTTPStatus.UNAUTHORIZED
    assert manual.files == []


async def test_download(
    store: ManualStore, hass_client, hass_read_only_access_token: str
) -> None:
    """Any user can read a file, displayed inline, never sniffed."""
    manual = store.async_create(title="T")
    file = await store.async_add_file(manual.id, 'Notice "chaudière".png', PNG)
    client = await hass_client(hass_read_only_access_token)

    resp = await client.get(f"/api/manuals/file/{manual.id}/{file.id}")

    assert resp.status == HTTPStatus.OK
    assert await resp.read() == PNG
    assert resp.headers["Content-Type"] == "image/png"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert (
        resp.headers["Content-Disposition"]
        == "inline; filename*=UTF-8''Notice%20%22chaudi%C3%A8re%22.png"
    )


async def test_download_legacy_type_as_attachment(
    hass: HomeAssistant, store: ManualStore, hass_client
) -> None:
    """A file stored with another type is downloaded, not displayed."""
    manual = store.async_create(title="T")
    file = await store.async_add_file(manual.id, "a.pdf", PDF)
    file.content_type = "text/html"
    client = await hass_client()

    resp = await client.get(f"/api/manuals/file/{manual.id}/{file.id}")

    assert resp.headers["Content-Type"] == "application/octet-stream"
    assert resp.headers["Content-Disposition"].startswith("attachment;")


async def test_download_not_found(store: ManualStore, hass_client) -> None:
    manual = store.async_create(title="T")
    manual.files.append(ManualFile(id="link", filename="a", url="https://example.com"))
    client = await hass_client()

    for path in (f"{manual.id}/missing", f"{manual.id}/link", "missing/link"):
        resp = await client.get(f"/api/manuals/file/{path}")
        assert resp.status == HTTPStatus.NOT_FOUND, path


async def test_download_requires_auth(store: ManualStore, hass_client_no_auth) -> None:
    manual = store.async_create(title="T")
    file = await store.async_add_file(manual.id, "a.pdf", PDF)
    client = await hass_client_no_auth()

    resp = await client.get(f"/api/manuals/file/{manual.id}/{file.id}")

    assert resp.status == HTTPStatus.UNAUTHORIZED
