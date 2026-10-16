"""Tests for the local copy of a link, against a real local HTTP server."""

from __future__ import annotations

from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestServer
import pytest

from custom_components.manuals.downloader import (
    DownloadError,
    async_download,
    async_probe,
)
from homeassistant.core import HomeAssistant

from .conftest import PDF, PNG


async def _pdf(request: web.Request) -> web.Response:
    return web.Response(body=PDF, content_type="application/pdf")


async def _page(request: web.Request) -> web.Response:
    return web.Response(text="<html></html>", content_type="text/html")


async def _attachment(request: web.Request) -> web.Response:
    """Generic type and a name only in Content-Disposition, as many sites do."""
    return web.Response(
        body=PDF,
        content_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''Notice%20%C3%A9t%C3%A9.pdf"
        },
    )


async def _svg(request: web.Request) -> web.Response:
    return web.Response(text="<svg/>", content_type="image/svg+xml")


async def _browsers_only(request: web.Request) -> web.Response:
    if "Mozilla" not in request.headers.get("User-Agent", ""):
        raise web.HTTPForbidden
    return web.Response(body=PNG, content_type="image/png")


async def _big(request: web.Request) -> web.StreamResponse:
    """No Content-Length: the size limit applies while downloading."""
    resp = web.StreamResponse(headers={"Content-Type": "application/pdf"})
    resp.enable_chunked_encoding()
    await resp.prepare(request)
    for _ in range(4):
        await resp.write(PDF)
    return resp


async def _missing(request: web.Request) -> web.Response:
    raise web.HTTPNotFound


@pytest.fixture
async def server(socket_enabled: None):
    """Local HTTP server (only 127.0.0.1 is reachable in tests)."""
    app = web.Application()
    app.router.add_get("/files/manual.pdf", _pdf)
    app.router.add_get("/page", _page)
    app.router.add_get("/download", _attachment)
    app.router.add_get("/image.svg", _svg)
    app.router.add_get("/protected.png", _browsers_only)
    app.router.add_get("/big", _big)
    app.router.add_get("/missing", _missing)
    async with TestServer(app) as server:
        yield server


async def test_probe_document(hass: HomeAssistant, server: TestServer) -> None:
    probe = await async_probe(hass, str(server.make_url("/files/manual.pdf")))
    assert probe.is_document
    assert probe.content_type == "application/pdf"
    assert probe.filename == "manual.pdf"
    assert probe.size == len(PDF)


async def test_probe_page(hass: HomeAssistant, server: TestServer) -> None:
    probe = await async_probe(hass, str(server.make_url("/page")))
    assert not probe.is_document
    assert probe.content_type == "text/html"


async def test_probe_svg_is_not_a_document(
    hass: HomeAssistant, server: TestServer
) -> None:
    assert not (await async_probe(hass, str(server.make_url("/image.svg")))).is_document


async def test_download_named_by_content_disposition(
    hass: HomeAssistant, server: TestServer
) -> None:
    probe, content = await async_download(hass, str(server.make_url("/download")))
    assert content == PDF
    assert probe.content_type == "application/pdf"
    assert probe.filename == "Notice été.pdf"


async def test_download_retries_as_a_browser(
    hass: HomeAssistant, server: TestServer
) -> None:
    probe, content = await async_download(hass, str(server.make_url("/protected.png")))
    assert content == PNG
    assert probe.content_type == "image/png"


async def test_download_refuses_pages(hass: HomeAssistant, server: TestServer) -> None:
    with pytest.raises(DownloadError) as err:
        await async_download(hass, str(server.make_url("/page")))
    assert err.value.code == "not_document"


async def test_download_size_limit(hass: HomeAssistant, server: TestServer) -> None:
    with (
        patch("custom_components.manuals.downloader.MAX_UPLOAD_SIZE", len(PDF) * 2),
        pytest.raises(DownloadError) as err,
    ):
        await async_download(hass, str(server.make_url("/big")))
    assert err.value.code == "too_large"


async def test_download_http_error(hass: HomeAssistant, server: TestServer) -> None:
    with pytest.raises(DownloadError) as err:
        await async_download(hass, str(server.make_url("/missing")))
    assert err.value.code == "download_failed"
