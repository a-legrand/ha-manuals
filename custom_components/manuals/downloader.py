"""Fetch a document (PDF, image) from a URL, to keep a local copy of a link."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

import aiohttp
from aiohttp.hdrs import CONTENT_DISPOSITION
from aiohttp.multipart import content_disposition_filename, parse_content_disposition

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOCUMENT_TYPES, MAX_UPLOAD_SIZE

ACCEPT = {"Accept": "application/pdf,image/*;q=0.9,*/*;q=0.5"}
# Some manufacturer sites refuse non-browser clients, while others (w3.org...)
# refuse an incomplete browser identity: try HA's own user agent first.
BROWSER_HEADERS = {
    **ACCEPT,
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/141.0 Safari/537.36"
    ),
}
PROBE_TIMEOUT = aiohttp.ClientTimeout(total=20)
DOWNLOAD_TIMEOUT = aiohttp.ClientTimeout(total=300, sock_read=60)

# Generic types some servers send for any file.
BINARY_TYPES = {
    "application/octet-stream",
    "binary/octet-stream",
    "application/download",
}


class DownloadError(Exception):
    """Fetching failed. `code` is sent to the frontend, which translates it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Probe:
    """What a URL points to, read from the response headers only."""

    url: str  # after redirects
    content_type: str
    size: int | None
    filename: str
    is_document: bool


def _document_type(content_type: str, filename: str) -> str | None:
    """Content type announced for a document, or None for anything else.

    Only a first guess, from the headers: the stored type is read from the
    content itself (see `store.sniff_content_type`).
    """
    if content_type in DOCUMENT_TYPES:
        return content_type
    if content_type in BINARY_TYPES and filename.lower().endswith(".pdf"):
        return "application/pdf"
    return None


def _filename(resp: aiohttp.ClientResponse) -> str:
    _, params = parse_content_disposition(resp.headers.get(CONTENT_DISPOSITION))
    if name := content_disposition_filename(params, "filename"):
        return name
    name = unquote(PurePosixPath(urlparse(str(resp.url)).path).name)
    return name or resp.url.host or "document"


def _probe(resp: aiohttp.ClientResponse) -> Probe:
    filename = _filename(resp)
    content_type = resp.content_type.lower()
    document_type = _document_type(content_type, filename)
    return Probe(
        url=str(resp.url),
        content_type=document_type or content_type,
        size=resp.content_length,
        filename=filename,
        is_document=document_type is not None,
    )


@asynccontextmanager
async def _get(
    hass: HomeAssistant, url: str, timeout: aiohttp.ClientTimeout
) -> AsyncIterator[aiohttp.ClientResponse]:
    """GET `url`, again as a browser if refused. Raises on HTTP errors."""
    session = async_get_clientsession(hass)
    async with session.get(url, headers=ACCEPT, timeout=timeout) as resp:
        if resp.status not in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
            resp.raise_for_status()
            yield resp
            return
    async with session.get(url, headers=BROWSER_HEADERS, timeout=timeout) as resp:
        resp.raise_for_status()
        yield resp


async def async_probe(hass: HomeAssistant, url: str) -> Probe:
    """Read the headers of `url` (GET, as HEAD is often wrong or refused)."""
    try:
        async with _get(hass, url, PROBE_TIMEOUT) as resp:
            return _probe(resp)
    except (aiohttp.ClientError, TimeoutError) as err:
        raise DownloadError("download_failed", str(err) or type(err).__name__) from err


async def async_download(hass: HomeAssistant, url: str) -> tuple[Probe, bytes]:
    """Download the document at `url`. Refuses web pages and oversized files."""
    try:
        async with _get(hass, url, DOWNLOAD_TIMEOUT) as resp:
            probe = _probe(resp)
            if not probe.is_document:
                raise DownloadError("not_document", probe.content_type)
            if probe.size and probe.size > MAX_UPLOAD_SIZE:
                raise DownloadError("too_large", f"{probe.size} bytes")
            content = bytearray()
            async for chunk in resp.content.iter_chunked(64 * 1024):
                content.extend(chunk)
                if len(content) > MAX_UPLOAD_SIZE:
                    raise DownloadError("too_large", f"> {MAX_UPLOAD_SIZE} bytes")
    except (aiohttp.ClientError, TimeoutError) as err:
        raise DownloadError("download_failed", str(err) or type(err).__name__) from err

    if probe.content_type == "application/pdf" and not probe.filename.lower().endswith(
        ".pdf"
    ):
        probe.filename += ".pdf"
    return probe, bytes(content)
