"""con — quick capture CLI for Constellation.

Usage:
  con "quick thought"                        # first line = title, no content
  con -t "SPI timing" -c "CS must go low before SCLK"
  con                                        # interactive: prompts for title then content
"""

import argparse
import os
import sys

import httpx


API_BASE = os.environ.get("CONSTELLATION_API_URL", "http://localhost:8000")


def _post_fleeting(title: str, content: str) -> None:
    url = f"{API_BASE}/api/v1/nodes/fleeting"
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json={"title": title, "content": content})
    except httpx.ConnectError:
        print(f"error: could not connect to backend at {API_BASE}", file=sys.stderr)
        sys.exit(1)
    except httpx.TimeoutException:
        print(f"error: request timed out connecting to {API_BASE}", file=sys.stderr)
        sys.exit(1)

    if not resp.is_success:
        print(f"error: backend returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    node = resp.json()
    print(f"{node['title']}  [{node['id']}]")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="con",
        description="Capture a fleeting note into Constellation.",
        add_help=True,
    )
    parser.add_argument("-t", "--title", help="Note title")
    parser.add_argument("-c", "--content", help="Note content", default="")
    parser.add_argument("text", nargs="?", help="Quick capture: first line becomes title")

    args = parser.parse_args()

    if args.title:
        title = args.title.strip()
        content = args.content.strip()
    elif args.text:
        title = args.text.strip()
        content = args.content.strip()
    else:
        # interactive mode
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

    _post_fleeting(title, content)


if __name__ == "__main__":
    main()
