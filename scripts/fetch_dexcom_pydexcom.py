#!/usr/bin/env python3
"""
Dexcom Share → stdout JSON for Align (pydexcom).

Requires: pip install pydexcom
Env: PYDEXCOM_USERNAME, PYDEXCOM_PASSWORD, PYDEXCOM_REGION (us | ous | eu | jp)
Output: one JSON object — { "ok": true, "egvs": [...] } or { "ok": false, "error": "..." }

Credentials must come from the environment only (no hardcoded defaults).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import timezone


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--minutes",
        type=int,
        default=1440,
        help="Requested lookback minutes (capped to 1440 per pydexcom public API).",
    )
    args = parser.parse_args()

    user = (os.environ.get("PYDEXCOM_USERNAME") or "").strip()
    pw = os.environ.get("PYDEXCOM_PASSWORD") or ""
    if not user or not pw:
        emit({"ok": False, "error": "Missing PYDEXCOM_USERNAME or PYDEXCOM_PASSWORD"})
        return

    try:
        from pydexcom import Dexcom
        from pydexcom.const import Region
    except ImportError as e:
        emit({"ok": False, "error": f"pydexcom not installed: {e}"})
        return

    raw = (os.environ.get("PYDEXCOM_REGION") or "us").strip().lower()
    if raw in ("us", "usa", ""):
        region = Region.US
    elif raw == "jp":
        region = Region.JP
    else:
        region = Region.OUS

    minutes = max(1, min(int(args.minutes), 90 * 24 * 60))
    minutes_capped = min(minutes, 1440)
    max_count = 288

    dex = None
    try:
        dex = Dexcom(username=user, password=pw, region=region)
    except TypeError:
        try:
            reg = region.value if hasattr(region, "value") else str(region)
            dex = Dexcom(username=user, password=pw, region=reg)  # type: ignore[arg-type]
        except Exception as e:
            emit({"ok": False, "error": f"Dexcom init failed: {e}"})
            return
    except Exception as e:
        emit({"ok": False, "error": f"Dexcom init failed: {e}"})
        return

    if dex is None:
        emit({"ok": False, "error": "Dexcom client not initialized"})
        return

    try:
        readings = dex.get_glucose_readings(minutes=minutes_capped, max_count=max_count)
    except Exception as e:
        emit({"ok": False, "error": f"get_glucose_readings failed: {e}"})
        return

    egvs = []
    for r in readings:
        try:
            dt = r.datetime
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            iso = dt.isoformat().replace("+00:00", "Z")
        except Exception:
            continue
        trend = getattr(r, "trend_description", None)
        egvs.append(
            {
                "systemTime": iso,
                "value": int(r.value),
                "unit": "mg/dL",
                "trend": trend,
            }
        )

    emit({"ok": True, "egvs": egvs})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover
        emit({"ok": False, "error": str(exc)})
