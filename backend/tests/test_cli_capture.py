"""CLI smoke tests for `con` — focuses on the unique flag-handling logic.

The CLI is thin: it parses args, optionally calls `/projects/resolve` to
get a primary_tag_id, then POSTs to `/nodes/fleeting`. Tests mock httpx
so they don't need a running backend.
"""

import sys

import pytest

from app.cli import capture as cli


class FakeResponse:
    def __init__(self, status_code: int, json_body: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json = json_body or {}
        self.text = text

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> dict:
        return self._json


class FakeClient:
    """Records the calls made on it; returns scripted responses."""

    def __init__(self, responses: list[FakeResponse]):
        self._responses = list(responses)
        self.calls: list[tuple[str, str, dict]] = []  # (method, url, kwargs)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, url, params=None):
        self.calls.append(("GET", url, {"params": params}))
        return self._responses.pop(0)

    def post(self, url, json=None):
        self.calls.append(("POST", url, {"json": json}))
        return self._responses.pop(0)


def _patch_httpx(monkeypatch, fake_client):
    monkeypatch.setattr(cli.httpx, "Client", lambda timeout=10.0: fake_client)


def test_capture_basic_positional_title(monkeypatch, capsys):
    fc = FakeClient([FakeResponse(201, {"id": "n1", "title": "hello"})])
    _patch_httpx(monkeypatch, fc)
    monkeypatch.setattr(sys, "argv", ["con", "hello"])
    cli._capture_main()
    assert fc.calls == [
        (
            "POST",
            "http://localhost:8000/api/v1/nodes/fleeting",
            {"json": {"title": "hello", "content": ""}},
        )
    ]
    out = capsys.readouterr().out
    assert "hello" in out and "n1" in out


def test_capture_title_and_content_flags(monkeypatch):
    fc = FakeClient([FakeResponse(201, {"id": "n1", "title": "Hi"})])
    _patch_httpx(monkeypatch, fc)
    monkeypatch.setattr(sys, "argv", ["con", "-t", "Hi", "-c", "body"])
    cli._capture_main()
    assert fc.calls[0][2]["json"] == {"title": "Hi", "content": "body"}


def test_capture_with_project_resolves_and_attaches_tag(monkeypatch, capsys):
    fc = FakeClient(
        [
            FakeResponse(200, {"hub_node_id": "hub-1", "primary_tag_id": "tag-1"}),
            FakeResponse(201, {"id": "n1", "title": "thought"}),
        ]
    )
    _patch_httpx(monkeypatch, fc)
    monkeypatch.setattr(sys, "argv", ["con", "--project", "eurorack", "thought"])
    cli._capture_main()

    assert len(fc.calls) == 2
    method, url, kwargs = fc.calls[0]
    assert method == "GET"
    assert url.endswith("/projects/resolve")
    assert kwargs["params"] == {"name": "eurorack"}

    method, url, kwargs = fc.calls[1]
    assert method == "POST"
    assert url.endswith("/nodes/fleeting")
    assert kwargs["json"] == {"title": "thought", "content": "", "tag_ids": ["tag-1"]}


def test_capture_with_project_unknown_exits_with_message(monkeypatch, capsys):
    fc = FakeClient([FakeResponse(404, text="not found")])
    _patch_httpx(monkeypatch, fc)
    monkeypatch.setattr(sys, "argv", ["con", "--project", "ghost", "thought"])
    with pytest.raises(SystemExit) as exc_info:
        cli._capture_main()
    assert exc_info.value.code == 2
    err = capsys.readouterr().err
    assert "no project named 'ghost'" in err
    assert "primary tag" in err
    # No fleeting POST should have happened
    assert len(fc.calls) == 1


def test_capture_without_project_does_not_call_resolve(monkeypatch):
    fc = FakeClient([FakeResponse(201, {"id": "n1", "title": "Hi"})])
    _patch_httpx(monkeypatch, fc)
    monkeypatch.setattr(sys, "argv", ["con", "Hi"])
    cli._capture_main()
    assert len(fc.calls) == 1
    assert fc.calls[0][0] == "POST"
    # No tag_ids in the body when --project is absent
    assert "tag_ids" not in fc.calls[0][2]["json"]
