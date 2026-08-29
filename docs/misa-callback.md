# MISA AMIS Kế toán callback

The public callback URL is `POST /api/integrations/misa/callback`. It is intentionally outside the application's normal `/api/v1` prefix because MISA registers a fixed callback URL.

Set the registered MISA application ID in each deployment environment:

```env
MISA_APP_ID=
```

When `MISA_APP_ID` is present, the receiver requires MISA's documented HMAC-SHA256 signature of the original `data` string. Without it, the receiver logs a warning and accepts the callback only to permit local development before credentials have been provisioned. Configure the variable before exposing the callback in production.

Example local request (replace the signature after configuring `MISA_APP_ID`):

```bash
curl -X POST http://localhost:3333/api/integrations/misa/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "success": true,
    "error_code": "",
    "error_message": "",
    "signature": "<hmac-sha256-of-data>",
    "data_type": 1,
    "org_company_code": "demo-company",
    "app_id": "<your-misa-app-id>",
    "data": "[{\"org_refid\":\"demo-order-123\",\"success\":true}]"
  }'
```

The current idempotency store is in-memory and only protects duplicate deliveries within one running process. Before a handler causes persistent side effects, replace it with a database-backed uniqueness constraint keyed by `request_id`, `org_refid`, or MISA's applicable operation identifier.
