"""Check Tripo connectivity without creating a paid generation task."""

import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def load_key():
    key = os.environ.get("TRIPO_API_KEY", "").strip()
    if not key:
        path = Path(__file__).resolve().parents[1] / ".env.local"
        if path.exists():
            for line in path.read_text(encoding="utf-8-sig").splitlines():
                name, separator, value = line.partition("=")
                if separator and name.strip() == "TRIPO_API_KEY":
                    key = value.strip().strip("\"'")
    if not key:
        sys.exit("TRIPO_API_KEY is missing in .env.local.")
    return key


def main():
    request = Request(
        "https://openapi.tripo3d.ai/v3/account/balance",
        headers={"Authorization": "Bearer " + load_key()},
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
    except HTTPError as error:
        sys.exit(f"Tripo connection failed: HTTP {error.code}")
    except (URLError, TimeoutError):
        sys.exit("Tripo connection failed: network or timeout error.")
    except (ValueError, UnicodeError):
        sys.exit("Tripo returned an invalid response.")
    if result.get("code") != 0:
        sys.exit("Tripo returned an API error; no generation was requested.")
    data = result.get("data", {})
    print(json.dumps({"connected": True, "balance": data.get("balance"),
                      "frozen": data.get("frozen")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
