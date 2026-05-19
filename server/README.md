# Supplier order API (backend)

Express server that generates supplier order PDFs from a **Google Docs template**, uploads them to Google Drive, updates Airtable (e.g. טופס הזמנה or מסמך הזמנה), and emails the supplier.

## Endpoints

- **POST /api/supplier-order/submit** — **Full workflow** for automations (n8n, etc.): creates the supplier order + line rows in Airtable (unless `orderId` is provided), generates the PDF from the Google Docs template, uploads to Drive, patches **טופס הזמנה**, and by default emails the supplier. Body: `{ order: { supplierId, date?, notes?, email? }, lines: [...], action?: "save" | "send" }`. Response: `{ ok, orderId, created, lineCount, pdfUrl, emailed, order_reference }`.
- **POST /api/supplier-order/pdf** — Copies the template Doc, fills placeholders and the order-lines table, exports as PDF, uploads to Drive, patches Airtable **טופס הזמנה**, and returns `{ ok, pdfUrl }` (requires existing `orderId`).
- **POST /api/supplier-order/send** — Same as pdf for an existing `orderId`, then emails the supplier.
- **POST /api/supplier-quote-request/submit** — For each selected supplier: copy **quote demand** template (`GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID`), fill placeholders + `{{LINE_ROW}}` table, PDF to Drive, create row in **בקשת הצעת מחיר מספק**.
- **GET /api/supplier-quote-approve/requests** — List pending quote requests for the approval form.
- **GET /api/supplier-quote-approve/requests/:id** — Quote request detail + resolved material lines.
- **POST /api/supplier-quote-approve/submit** — Approve quote (`price`, status **אושר**), create supplier order, PDF, email. Body: `{ quoteRequestId, price, action?: "send" }`.

Request body for both:

```json
{
  "orderId": "recXXXX",
  "order": {
    "supplierId": "recYYYY",
    "date": "2025-03-16",
    "notes": "...",
    "materialsSummary": "..."
  },
  "lines": [
    {
      "materialName": "...",
      "freeDescription": "...",
      "dimensions": "...",
      "quantity": "10",
      "lineNotes": "..."
    }
  ]
}
```

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. **Airtable**: Use the same base and API key as the frontend. Set table IDs for supplier orders and suppliers. Set `AIRTABLE_ORDER_FORM_FIELD` to the field name where the PDF link is stored (default: `טופס הזמנה`; use `מסמך הזמנה` if your base uses that). Set `AIRTABLE_ORDER_REFERENCE_FIELD` to the field that holds the order reference for the template (default: `reference`). Set `AIRTABLE_SUPPLIERS_EMAIL_FIELD` (e.g. `מייל`).
3. **Google Drive & Docs template**: Set `GOOGLE_DRIVE_FOLDER_ID` and `GOOGLE_DOCS_TEMPLATE_ID`. Put the template Doc in that folder (owned by the Google account you authenticate with). **Template placeholders**: `{{supplierName}}`, `{{date}}`, `{{notes}}`, **`{{order_ref}}`** (or `{{order_reference}}`) from Airtable field `reference` (`AIRTABLE_ORDER_REFERENCE_FIELD`). In a **table**: header row (fixed text), then one data row with **`{{LINE_ROW}}`** in a cell (e.g. first column). The API duplicates that row for each order line and fills חומר / מידות / כמות / הערות.
   - **Auth option A — OAuth (recommended for Gmail)**: Uses **your** Google account and **your** Drive storage. Enable **Drive API** + **Google Docs API**. Create an **OAuth 2.0 Web client**; add redirect URI `http://localhost:3001/api/google/oauth/callback` (and your Railway URL + same path for production). In `.env`: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (must match Console exactly), `GOOGLE_OAUTH_SETUP_KEY` (long secret). Start server, then open:
     - `http://localhost:3001/api/google/oauth/start?setup_key=YOUR_SETUP_KEY`
     Google redirects back; copy **`GOOGLE_OAUTH_REFRESH_TOKEN`** into `.env` and restart. If no refresh token appears, revoke the app under Google Account → Third-party access and run start again.
   - **Auth option B — Service account**: JSON key via `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_SERVICE_ACCOUNT_JSON`. Share folder/template with the service account email. Note: copies may hit service-account Drive quota; use **Shared Drive** or OAuth if you see quota errors. If both OAuth refresh token and service account are set, OAuth wins unless `GOOGLE_AUTH_MODE=service_account`.
4. **SMTP**: Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM` for sending email to suppliers.

## Run

```bash
npm install
npm run dev   # development with --watch
# or
npm start     # production
```

Default port: **3001**. Set `PORT` in `.env` to change.

## Frontend

In the frontend `.env`, set:

```
VITE_PDF_API_BASE_URL=http://localhost:3001
```

For production, use the deployed backend URL.

## Quote form (`POST /api/quote/submit`)

If the body includes **`new_contact`** `{ name, email?, phone? }` instead of **`contact`** ids, the server creates a **Contact** row, links it to the selected **customer** (see `AIRTABLE_QUOTE_*` and `QUOTE_*_LINK_FIELD` in `server/.env.example`), then creates the quote with that contact id. Otherwise behavior is unchanged: creates a row in **Airtable** (`AIRTABLE_QUOTES_TABLE_ID`), resolves **`quote_reference`** from the new row’s formula field when present (otherwise sorted prediction by `QUOTE_REFERENCE_SORT_FIELD` / `QUOTE_FIELD_CREATED_AT`, then paginated scan), then POSTs JSON to **n8n** if `N8N_QUOTE_WEBHOOK_URL` is set. The reference is **not** written by the API. `GET /api/quote/next-reference` returns the same prediction for the form preview.

**Server `.env`:** `AIRTABLE_BASE_ID`, `AIRTABLE_API_KEY`, `AIRTABLE_QUOTES_TABLE_ID`, `AIRTABLE_QUOTE_REFERENCE_FIELD`, and optional `QUOTE_FIELD_*` overrides (see `server/.env.example`). Set **`AIRTABLE_QUOTE_INTERFACE_PAGE_ID`** (`pag…` from your **Interface** URL) so the success screen’s “open in Airtable” link opens the **Interface** record page (`/app/…/pag/…/rec…`), not the Data table. If unset, the link falls back to the table URL. Add matching columns in Airtable for any new fields (פנימי: הערות פנימיות; מועד מסירת סקיצה; הובלה ללקוח; תוספות לגוף המייל). If your Quotes table has no columns for מע״מ / סה״כ, set `QUOTE_OMIT_TAX_FIELDS=true` so only `price` is written; tax values are still sent to n8n. The n8n webhook body includes the same keys as the normalized payload (`delivery_to_client_by`, `delivery_to_client_label`, `send_to_client_email_additions`, etc.).

**Frontend `.env`:** `VITE_CUSTOMERS_TABLE_ID`, `VITE_CONTACTS_TABLE_ID` (legacy: `VITE_QUOTE_*`), **`VITE_CUSTOMER_CONTACTS_LINK_FIELD`** — field **on Customers** that links to Contacts (required for loading contacts on the quote form). Supports field name or `fld…` (the app uses `returnFieldsByFieldId` when the value looks like a field id). `VITE_CONTACT_CUSTOMER_LINK_FIELD` / `VITE_CONTACT_CUSTOMER_LINK_MULTIPLE` are **not** used for loading contacts anymore. `VITE_PDF_API_BASE_URL` must point at this server for submit.
