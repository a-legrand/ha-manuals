"""Tests for the data model and the store."""

from __future__ import annotations

from pathlib import Path

import pytest

from custom_components.manuals.store import (
    FileNotFoundInManualError,
    Manual,
    ManualFile,
    ManualStore,
    UnsupportedFileError,
    normalize,
    sniff_content_type,
)
from homeassistant.const import EVENT_HOMEASSISTANT_FINAL_WRITE
from homeassistant.core import HomeAssistant

from .conftest import PDF, PNG


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        (PDF, "application/pdf"),
        (b"\xef\xbb\xbf junk before the header %PDF-1.4", "application/pdf"),
        (PNG, "image/png"),
        (b"\xff\xd8\xff\xe0" + b"\x00" * 8, "image/jpeg"),
        (b"GIF89a" + b"\x00" * 8, "image/gif"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (b"<html><script>alert(1)</script></html>", None),
        (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", None),
        (b"", None),
    ],
)
def test_sniff_content_type(content: bytes, expected: str | None) -> None:
    assert sniff_content_type(content) == expected


def test_sniff_pdf_header_must_be_in_first_kilobyte() -> None:
    assert sniff_content_type(b"\x00" * 1024 + b"%PDF-1.4") is None


def test_normalize() -> None:
    assert normalize("Électrique ÇA") == "electrique ca"


def test_matches_every_word_of_edited_fields() -> None:
    manual = Manual(
        id="1",
        title="Radiateur",
        brand="Atlantic",
        model="Divali",
        tags=["chauffage"],
        notes="Hors-gel : appui long",
    )
    assert manual.matches("atlantic radiateur")
    assert manual.matches("CHAUFFAGE")
    assert manual.matches("hors gel")  # "hors-gel" contains "hors" and "gel"
    assert not manual.matches("atlantic bosch")


def test_matches_documents_and_devices() -> None:
    manual = Manual(
        id="1",
        title="T",
        files=[
            ManualFile(
                id="f",
                filename="Notice_Divali.pdf",
                source_url="https://www.atlantic.fr/x.pdf",
            ),
            ManualFile(
                id="l", filename="Product page", url="https://example.com/heater"
            ),
        ],
    )
    assert manual.matches("divali")
    assert manual.matches("atlantic.fr")
    assert manual.matches("example heater")
    assert manual.matches("bedroom", linked_names=["Bedroom radiator"])
    assert not manual.matches("bedroom")


def test_from_dict_ignores_unknown_fields() -> None:
    manual = Manual.from_dict(
        {
            "id": "1",
            "title": "T",
            "removed_field": True,
            "files": [{"id": "f", "filename": "a.pdf", "old": 1}],
        }
    )
    assert manual.title == "T"
    assert manual.files[0].filename == "a.pdf"


async def test_persistence(hass: HomeAssistant, store: ManualStore) -> None:
    manual = store.async_create(title="Boiler", tags=["heating"])
    store.async_set_device_ignored("phone", True)
    # Saves are delayed: flush them as on shutdown.
    hass.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
    await hass.async_block_till_done()

    reloaded = ManualStore(hass)
    await reloaded.async_load()
    assert reloaded.manuals[manual.id].tags == ["heating"]
    assert reloaded.ignored_device_ids == {"phone"}


async def test_update_only_editable_fields(store: ManualStore) -> None:
    manual = store.async_create(title="Old")
    store.async_update(manual.id, title="New", id="hacked", files=[])
    assert manual.title == "New"
    assert manual.id != "hacked"


async def test_add_file_detects_type(store: ManualStore, config_dir: Path) -> None:
    manual = store.async_create(title="T")
    file = await store.async_add_file(manual.id, "scan.bin", PNG)
    assert file.content_type == "image/png"
    assert file.size == len(PNG)
    assert (config_dir / "manuals" / manual.id / file.id).read_bytes() == PNG


async def test_add_file_refuses_other_content(
    store: ManualStore, config_dir: Path
) -> None:
    manual = store.async_create(title="T")
    with pytest.raises(UnsupportedFileError):
        await store.async_add_file(manual.id, "page.html", b"<html></html>")
    assert manual.files == []
    assert not (config_dir / "manuals" / manual.id).exists()


async def test_remove_file(store: ManualStore, config_dir: Path) -> None:
    manual = store.async_create(title="T")
    file = await store.async_add_file(manual.id, "a.pdf", PDF)
    link = store.async_add_link(manual.id, "https://example.com/a.pdf", "a.pdf")

    await store.async_remove_file(manual.id, file.id)
    await store.async_remove_file(manual.id, link.id)

    assert manual.files == []
    assert not (config_dir / "manuals" / manual.id / file.id).exists()


async def test_remove_file_refuses_foreign_ids(
    store: ManualStore, config_dir: Path
) -> None:
    """A file id is part of a disk path: only the manual's own ids are used."""
    victim = config_dir / "configuration.yaml"
    victim.write_text("keep me")
    manual = store.async_create(title="T")

    with pytest.raises(FileNotFoundInManualError):
        await store.async_remove_file(manual.id, "../../configuration.yaml")
    assert victim.read_text() == "keep me"


async def test_delete_removes_files(store: ManualStore, config_dir: Path) -> None:
    manual = store.async_create(title="T")
    await store.async_add_file(manual.id, "a.pdf", PDF)

    await store.async_delete(manual.id)

    assert manual.id not in store.manuals
    assert not (config_dir / "manuals" / manual.id).exists()
