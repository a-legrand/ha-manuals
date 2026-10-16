"""HTTP views: file upload (multipart) and authenticated file download."""

from __future__ import annotations

from dataclasses import asdict
from http import HTTPStatus
from urllib.parse import quote, unquote

from aiohttp import web

from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.components.http.decorators import require_admin
from homeassistant.core import HomeAssistant, callback

from .const import DOCUMENT_TYPES, DOMAIN, MAX_UPLOAD_SIZE, URL_FILE, URL_UPLOAD
from .store import ManualStore, UnsupportedFileError


@callback
def async_register(hass: HomeAssistant) -> None:
    hass.http.register_view(ManualUploadView())
    hass.http.register_view(ManualFileView())


class ManualUploadView(HomeAssistantView):
    """POST multipart/form-data with fields `manual_id` and `file`."""

    url = URL_UPLOAD
    name = f"api:{DOMAIN}:upload"

    @require_admin
    async def post(self, request: web.Request) -> web.Response:
        hass = request.app[KEY_HASS]
        store: ManualStore = hass.data[DOMAIN]

        # Default aiohttp limit is 1 MB, too small for PDF manuals.
        request._client_max_size = MAX_UPLOAD_SIZE  # noqa: SLF001
        data = await request.post()

        manual_id = data.get("manual_id")
        upload = data.get("file")
        if manual_id not in store.manuals or not isinstance(upload, web.FileField):
            return self.json_message("Invalid request", HTTPStatus.BAD_REQUEST)

        content = await hass.async_add_executor_job(upload.file.read)
        # Browsers percent-encode quotes and line breaks in the name.
        filename = unquote(upload.filename)
        try:
            file = await store.async_add_file(manual_id, filename, content)
        except UnsupportedFileError:
            return self.json_message(
                "Only PDF files and images are accepted",
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                "unsupported_type",
            )
        return self.json(asdict(file))


class ManualFileView(HomeAssistantView):
    """GET a manual file. Use `auth/sign_path` to open it in a new tab."""

    url = URL_FILE
    name = f"api:{DOMAIN}:file"

    async def get(
        self, request: web.Request, manual_id: str, file_id: str
    ) -> web.StreamResponse:
        store: ManualStore = request.app[KEY_HASS].data[DOMAIN]

        manual = store.manuals.get(manual_id)
        file = (
            next((f for f in manual.files if f.id == file_id), None) if manual else None
        )
        if file is None or file.url:  # links are not stored here
            return web.Response(status=HTTPStatus.NOT_FOUND)

        # Displayed by the browser (PDF viewer, image) only for document types;
        # anything else, stored by an older version, is downloaded.
        inline = file.content_type in DOCUMENT_TYPES
        disposition = "inline" if inline else "attachment"
        return web.FileResponse(
            store.file_path(manual_id, file_id),
            headers={
                "Content-Type": file.content_type
                if inline
                else "application/octet-stream",
                "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(file.filename)}",
                "X-Content-Type-Options": "nosniff",
            },
        )
