#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.request


BASE_URL = "http://localhost:8001"


def request_json(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"raw": body}
        return exc.code, parsed


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    code, health = request_json("GET", "/health")
    assert_true(code == 200 and health.get("ok") is True, "Health endpoint failed")

    code, rows_payload = request_json("GET", "/api/main-rows?page=1&page_size=10")
    assert_true(code == 200, "main-rows list failed")
    rows = rows_payload.get("rows", [])
    assert_true(len(rows) >= 1, "Expected seeded rows in main_rows")

    row_id = rows[0]["id"]
    original_buc = rows[0]["buc"]
    updated_buc = int(original_buc) + 3

    code, patch_payload = request_json("PATCH", f"/api/main-rows/{row_id}", {"buc": updated_buc})
    assert_true(code == 200 and patch_payload.get("ok") is True, "Row patch failed")

    code, rows_after_payload = request_json("GET", "/api/main-rows?page=1&page_size=10")
    assert_true(code == 200, "main-rows list after patch failed")
    row_after = next((r for r in rows_after_payload.get("rows", []) if r["id"] == row_id), None)
    assert_true(row_after is not None, "Patched row missing from list")
    assert_true(int(row_after["buc"]) == updated_buc, "Patched buc value not persisted")

    code, recalc_run_payload = request_json(
        "POST",
        "/api/recalc/run",
        {"triggered_by": "manual", "triggered_by_user": "localstack-test"},
    )
    assert_true(code == 200 and recalc_run_payload.get("ok") is True, "Recalc run failed")

    code, recalc_status_payload = request_json("GET", "/api/recalc/status")
    assert_true(code == 200 and "status" in recalc_status_payload, "Recalc status failed")

    print("Localstack integration smoke test passed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Smoke test failed: {exc}")
        sys.exit(1)
