"""con — CLI interface for Constellation.

Subcommands:
  con import <file> [--source-title ...] [--source-type ...] ...
  con [capture options]   # default: quick fleeting note capture

Capture usage:
  con "quick thought"                        # first arg = title
  con -t "SPI timing" -c "CS must go low before SCLK"
  con --project eurorack "VCO drift idea"    # attach project's primary tag
  con                                        # interactive
"""

import argparse
import os
import subprocess
import sys

import httpx

API_BASE = os.environ.get("CONSTELLATION_API_URL", "http://localhost:8000")
FRONTEND_BASE = os.environ.get("CONSTELLATION_FRONTEND_URL", "http://localhost:3000")

_SOURCE_TYPES = ["datasheet", "manual", "book", "article", "video", "podcast", "other"]


# ---------------------------------------------------------------------------
# Shared HTTP helpers
# ---------------------------------------------------------------------------


def _handle_response_error(resp: httpx.Response) -> None:
    if not resp.is_success:
        print(f"error: backend returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)


def _connect_error(url: str) -> None:
    print(f"error: could not connect to backend at {url}", file=sys.stderr)
    sys.exit(1)


def _timeout_error(url: str) -> None:
    print(f"error: request timed out connecting to {url}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Capture subcommand
# ---------------------------------------------------------------------------


def _resolve_project_tag(name: str) -> str:
    """Hit `GET /projects/resolve?name=<name>` and return the primary_tag_id.

    Exits the process with a clear message if the project doesn't exist or
    has no primary tag set (ADR-063: silent-failure prevention — the CLI
    must surface this loudly rather than create an untagged note).
    """
    url = f"{API_BASE}/api/v1/projects/resolve"
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params={"name": name})
    except httpx.ConnectError:
        _connect_error(API_BASE)
        raise SystemExit(1)
    except httpx.TimeoutException:
        _timeout_error(API_BASE)
        raise SystemExit(1)

    if resp.status_code == 404:
        print(
            f"error: no project named '{name}' (or it has no primary tag set). "
            "Set the primary tag in the workspace before using --project.",
            file=sys.stderr,
        )
        sys.exit(2)
    _handle_response_error(resp)
    return resp.json()["primary_tag_id"]


def _post_fleeting(title: str, content: str, *, tag_ids: list[str] | None = None) -> None:
    url = f"{API_BASE}/api/v1/nodes/fleeting"
    body: dict = {"title": title, "content": content}
    if tag_ids:
        body["tag_ids"] = tag_ids
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=body)
    except httpx.ConnectError:
        _connect_error(API_BASE)
        return
    except httpx.TimeoutException:
        _timeout_error(API_BASE)
        return

    _handle_response_error(resp)
    node = resp.json()
    print(f"{node['title']}  [{node['id']}]")


def _capture_main() -> None:
    parser = argparse.ArgumentParser(
        prog="con",
        description="Capture a fleeting note into Constellation.",
        add_help=True,
    )
    parser.add_argument("-t", "--title", help="Note title")
    parser.add_argument("-c", "--content", help="Note content", default="")
    parser.add_argument(
        "--project",
        default=None,
        metavar="NAME",
        help=(
            "Attach the named project's primary tag to this capture. "
            "Resolves NAME against project_scopes.primary_tag_id via /projects/resolve."
        ),
    )
    parser.add_argument("text", nargs="?", help="Quick capture: first line becomes title")

    args = parser.parse_args()

    if args.title:
        title = args.title.strip()
        content = args.content.strip()
    elif args.text:
        title = args.text.strip()
        content = args.content.strip()
    else:
        try:
            title = input("Title: ").strip()
            if not title:
                print("error: title cannot be empty", file=sys.stderr)
                sys.exit(1)
            print("Content (blank line to finish, empty for none):")
            lines = []
            while True:
                line = input()
                if line == "":
                    break
                lines.append(line)
            content = "\n".join(lines)
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.", file=sys.stderr)
            sys.exit(1)

    if not title:
        print("error: title cannot be empty", file=sys.stderr)
        sys.exit(1)

    tag_ids: list[str] | None = None
    if args.project:
        tag_ids = [_resolve_project_tag(args.project)]

    _post_fleeting(title, content, tag_ids=tag_ids)


# ---------------------------------------------------------------------------
# Import subcommand
# ---------------------------------------------------------------------------


def _post_import(
    content: str,
    source_id: str | None,
    source_title: str | None,
    source_type: str | None,
    source_author: str | None,
    source_url: str | None,
) -> dict:
    url = f"{API_BASE}/api/v1/ingest/document"
    body: dict = {"content": content}
    if source_id is not None:
        body["source_id"] = source_id
    else:
        body["source"] = {
            "title": source_title,
            "type": source_type,
            "author": source_author,
            "url": source_url,
        }
    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(url, json=body)
    except httpx.ConnectError:
        _connect_error(API_BASE)
        raise SystemExit(1)
    except httpx.TimeoutException:
        _timeout_error(API_BASE)
        raise SystemExit(1)

    _handle_response_error(resp)
    return resp.json()


def _open_review_url(source_id: str) -> None:
    review_url = f"{FRONTEND_BASE}/ingest?source_id={source_id}"
    try:
        subprocess.Popen(
            ["xdg-open", review_url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        pass  # xdg-open not available; user can open the URL manually


def _import_main() -> None:
    parser = argparse.ArgumentParser(
        prog="con import",
        description="Import a document into Constellation as literature note candidates.",
    )
    parser.add_argument("file", help="Path to the file to import")
    parser.add_argument("--source-title", help="Source title (required unless --source-id given)")
    parser.add_argument(
        "--source-type",
        choices=_SOURCE_TYPES,
        help="Source type (required unless --source-id given)",
    )
    parser.add_argument("--source-author", default=None, help="Author (optional)")
    parser.add_argument("--source-url", default=None, help="URL or file:// path (optional)")
    parser.add_argument(
        "--source-id",
        default=None,
        help="Link to an existing source by ID instead of creating a new one",
    )

    args = parser.parse_args()

    # Validate source arguments
    if args.source_id is None:
        missing = []
        if not args.source_title:
            missing.append("--source-title")
        if not args.source_type:
            missing.append("--source-type")
        if missing:
            print(
                f"error: {' and '.join(missing)} required when --source-id is not provided",
                file=sys.stderr,
            )
            sys.exit(1)

    # Read file
    try:
        with open(args.file, encoding="utf-8") as fh:
            content = fh.read()
    except FileNotFoundError:
        print(f"error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)
    except OSError as exc:
        print(f"error: could not read file: {exc}", file=sys.stderr)
        sys.exit(1)

    result = _post_import(
        content=content,
        source_id=args.source_id,
        source_title=args.source_title,
        source_type=args.source_type,
        source_author=args.source_author,
        source_url=args.source_url,
    )

    chunks = result["chunks_processed"]
    candidates = result["total_candidates"]
    source_id = result["source_id"]
    print(
        f"Processed {chunks} chunk{'s' if chunks != 1 else ''}. Generated {candidates} candidate{'s' if candidates != 1 else ''}."
    )
    print(f"Source: {source_id}")
    print("Opening review page…")
    _open_review_url(source_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        sys.argv.pop(1)
        _import_main()
    else:
        _capture_main()


if __name__ == "__main__":
    main()
