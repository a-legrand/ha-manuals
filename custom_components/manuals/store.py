"""Persistence of manuals (metadata in .storage, files on disk)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, datetime
from pathlib import Path
import shutil
from typing import Any
import unicodedata
import uuid

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .const import FILES_DIR, STORAGE_KEY, STORAGE_VERSION

IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


class UnsupportedFileError(Exception):
    """The content is neither a PDF nor a supported image."""


class FileNotFoundInManualError(Exception):
    """The manual has no file with this id."""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def normalize(text: str) -> str:
    """Lowercase, without accents: "Électrique" → "electrique"."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def sniff_content_type(content: bytes) -> str | None:
    """Type read from the file signature (PDF or raster image), None otherwise.

    The type sent by the browser or the remote server is not trusted: files are
    served from Home Assistant's origin.
    """
    # PDF readers accept the header anywhere in the first kilobyte.
    if b"%PDF-" in content[:1024]:
        return "application/pdf"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return next(
        (
            type_
            for signature, type_ in IMAGE_SIGNATURES
            if content.startswith(signature)
        ),
        None,
    )


def _known_fields(cls: type, data: dict[str, Any]) -> dict[str, Any]:
    """Drop keys the dataclass does not know (data saved by another version)."""
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in data.items() if k in names}


@dataclass
class ManualFile:
    """A document of a manual (main PDF, appendix, diagram...).

    Either stored on disk (uploaded, or copied from `source_url`), or a link
    to a document hosted elsewhere (`url` set, nothing on disk).
    """

    id: str
    filename: str
    content_type: str = ""
    size: int = 0
    url: str | None = None
    source_url: str | None = None


@dataclass
class Manual:
    """A manual, linked to 0..n devices and 0..n areas."""

    id: str
    title: str
    brand: str = ""
    model: str = ""
    tags: list[str] = field(default_factory=list)
    notes: str = ""
    device_ids: list[str] = field(default_factory=list)
    area_ids: list[str] = field(default_factory=list)
    files: list[ManualFile] = field(default_factory=list)
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Manual:
        files = [
            ManualFile(**_known_fields(ManualFile, f)) for f in data.get("files", [])
        ]
        return cls(**{**_known_fields(cls, data), "files": files})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def matches(self, query: str, linked_names: Iterable[str] = ()) -> bool:
        """Every word of `query` appears in the manual's fields, its documents
        (names and URLs) or `linked_names` (devices, areas), ignoring case and
        accents.

        Never in the content of the documents.
        """
        documents = [
            value
            for f in self.files
            for value in (f.filename, f.url, f.source_url)
            if value
        ]
        text = normalize(
            " ".join(
                [
                    self.title,
                    self.brand,
                    self.model,
                    *self.tags,
                    self.notes,
                    *documents,
                    *linked_names,
                ]
            )
        )
        return all(word in text for word in normalize(query).split())


# Fields editable through the API (everything except ids, files and timestamps).
EDITABLE_FIELDS = (
    "title",
    "brand",
    "model",
    "tags",
    "notes",
    "device_ids",
    "area_ids",
)


class ManualStore:
    """In-memory index of manuals backed by a HA Store."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.files_root = Path(hass.config.path(FILES_DIR))
        self.manuals: dict[str, Manual] = {}
        # Devices that need no manual (hub, phone...): hidden from "devices
        # without manual".
        self.ignored_device_ids: set[str] = set()

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.manuals = {m["id"]: Manual.from_dict(m) for m in data.get("manuals", [])}
        self.ignored_device_ids = set(data.get("ignored_device_ids", []))

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "manuals": [manual.to_dict() for manual in self.manuals.values()],
            "ignored_device_ids": sorted(self.ignored_device_ids),
        }

    @callback
    def _async_save(self) -> None:
        self._store.async_delay_save(self._data_to_save, 1)

    async def async_flush(self) -> None:
        """Write pending changes now (replaces a delayed save), e.g. on unload."""
        await self._store.async_save(self._data_to_save())

    # -- Manuals ------------------------------------------------------------

    @callback
    def async_create(self, **fields: Any) -> Manual:
        manual = Manual(id=uuid.uuid4().hex, **fields)
        self.manuals[manual.id] = manual
        self._async_save()
        return manual

    @callback
    def async_update(self, manual_id: str, **fields: Any) -> Manual:
        manual = self.manuals[manual_id]
        for key, value in fields.items():
            if key in EDITABLE_FIELDS:
                setattr(manual, key, value)
        manual.updated_at = _now()
        self._async_save()
        return manual

    async def async_delete(self, manual_id: str) -> None:
        self.manuals.pop(manual_id)
        await self.hass.async_add_executor_job(
            shutil.rmtree, self.files_root / manual_id, True
        )
        self._async_save()

    @callback
    def async_set_device_ignored(self, device_id: str, ignored: bool) -> None:
        if ignored:
            self.ignored_device_ids.add(device_id)
        else:
            self.ignored_device_ids.discard(device_id)
        self._async_save()

    # -- Files --------------------------------------------------------------

    def file_path(self, manual_id: str, file_id: str) -> Path:
        return self.files_root / manual_id / file_id

    async def async_add_file(
        self,
        manual_id: str,
        filename: str,
        content: bytes,
        source_url: str | None = None,
    ) -> ManualFile:
        """Store `content`. Raises UnsupportedFileError if not a PDF or an image."""
        if (content_type := sniff_content_type(content)) is None:
            raise UnsupportedFileError(filename)
        manual = self.manuals[manual_id]
        file = ManualFile(
            id=uuid.uuid4().hex,
            filename=filename,
            content_type=content_type,
            size=len(content),
            source_url=source_url,
        )
        path = self.file_path(manual_id, file.id)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

        await self.hass.async_add_executor_job(_write)
        manual.files.append(file)
        manual.updated_at = _now()
        self._async_save()
        return file

    @callback
    def async_add_link(self, manual_id: str, url: str, label: str) -> ManualFile:
        manual = self.manuals[manual_id]
        link = ManualFile(id=uuid.uuid4().hex, filename=label, url=url)
        manual.files.append(link)
        manual.updated_at = _now()
        self._async_save()
        return link

    async def async_remove_file(self, manual_id: str, file_id: str) -> None:
        manual = self.manuals[manual_id]
        # Only ids of the manual's own files: `file_id` is part of a disk path.
        file = next((f for f in manual.files if f.id == file_id), None)
        if file is None:
            raise FileNotFoundInManualError(file_id)
        manual.files.remove(file)
        if not file.url:
            await self.hass.async_add_executor_job(
                self.file_path(manual_id, file_id).unlink, True
            )
        manual.updated_at = _now()
        self._async_save()
