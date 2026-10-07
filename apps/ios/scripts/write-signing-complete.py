#!/usr/bin/env python3
"""Write the signing completion body from the runner identity files."""

import json
import sys
from pathlib import Path


def main() -> None:
    runner = Path(sys.argv[1])
    sha = sys.argv[2].strip()
    identity = json.loads((runner / "unsigned-identity.json").read_text())
    profile = (runner / "profile-id.txt").read_text().strip()
    body = {
        "ipaSha256": sha,
        "profileIdentifier": profile,
        "appVersion": identity["appVersion"],
        "buildNumber": identity["buildNumber"],
        "sourceCommit": identity["sourceCommit"],
        "airliftSha": identity["airliftSha"],
    }
    (runner / "complete.json").write_text(json.dumps(body))


if __name__ == "__main__":
    main()
