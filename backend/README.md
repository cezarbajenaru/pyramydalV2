# Backend API

Single backend path for both production and localstack testing.
No duplicate mock backend.

**Setup:** see [docs/GUIDE.md](../docs/GUIDE.md#local-development) (bootstrap script recommended).

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Environment variables

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `AWS_REGION`
- `AWS_ENDPOINT_URL` (set to `http://localstack:4566` for localstack)
- `RECALC_LAMBDA_NAME`
