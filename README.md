# Airtable Multi-Record Form (Hebrew RTL)

A React application in Hebrew (RTL) that allows users to create multiple Airtable records in a single form submission. Users can dynamically add new record fields using a "+" button.

## Features

- ✨ Add multiple records dynamically with a "+" button
- 🇮🇱 Full Hebrew RTL (Right-to-Left) support
- 📋 Dropdown fields populated from Airtable tables
- 🎨 Modern, responsive UI/UX
- ✅ Form validation
- 📦 Batch creation (handles up to 10 records per API call automatically)
- 🔒 Secure API key management via environment variables
- 📱 Mobile-friendly design

## Form Fields

Each record contains:
- **פרויקט ייצור** (Production Project) - Dropdown from Airtable table
- **חומר** (Material) - Dropdown from Airtable table  
- **כמות** (Quantity) - Number input

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Airtable

1. Get your Airtable credentials:
   - **Base ID**: Found in your Airtable API documentation (https://airtable.com/api)
   - **Table Name**: The name of the table you want to add records to
   - **API Key**: Found in your Airtable account settings (https://airtable.com/account)

2. Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

3. Update `.env` with your actual values. **Use Table IDs** (recommended over table names):

```env
VITE_AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
VITE_AIRTABLE_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_AIRTABLE_API_KEY=keyXXXXXXXXXXXXXX

# Lookup table — production projects (for project dropdown)
VITE_PRODUCTION_PROJECTS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_PRODUCTION_PROJECTS_FIELD=Name
# Optional: client name in project dropdown label (default: לקוח)
# VITE_PRODUCTION_PROJECTS_CLIENT_FIELD=לקוח

# Materials-for-project destination table (VITE_AIRTABLE_TABLE_ID above)
# Optional: override Airtable field names if yours differ
# VITE_PROJECT_MATERIALS_FIELD_PROJECT=תיק ייצור
# VITE_PROJECT_MATERIALS_FIELD_NAME=שם חומר
# VITE_PROJECT_MATERIALS_FIELD_SIZE=מידה
# VITE_PROJECT_MATERIALS_FIELD_QUANTITY=כמות
# VITE_PROJECT_MATERIALS_FIELD_IN_STOCK=במלאי
# VITE_PROJECT_MATERIALS_FIELD_NOTES=הערות

# Supplier orders only — raw materials catalog (not used by materials-for-project form)
VITE_MATERIALS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_MATERIALS_FIELD=Name
# VITE_MATERIALS_DISPLAY_FIELD=שם מוצר

# Suppliers and supplier orders
VITE_SUPPLIERS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_SUPPLIER_ORDERS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_SUPPLIER_ORDER_LINES_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_SUPPLIERS_FIELD=Name

# Optional: PDF backend base URL (for "צור ושמור ב-Airtable" and "צור ושלח לספק")
# When set, the app will call POST .../api/supplier-order/pdf and .../api/supplier-order/send
# VITE_PDF_API_BASE_URL=https://your-backend.example.com

# Optional: comma-separated origins allowed for referrer gate (default: Airtable)
# VITE_ALLOWED_REFERRER_ORIGINS=https://airtable.com,https://app.airtable.com
```

**Finding Table IDs:**
- Open your base in Airtable and go to **Help** → **API documentation**
- Or: The table ID appears in the URL when you copy a table link (starts with `tbl`)
- Base ID starts with `app`, Table ID starts with `tbl`

### 3. Configure Your Airtable Tables

**Materials for project table** (`VITE_AIRTABLE_TABLE_ID` — where form rows are created):
- **תיק ייצור** — linked record to production projects
- **שם חומר** — single line text
- **מידה** — single line text (optional in the form)
- **כמות** — number
- **במלאי** — single select: `במלאי`, `לא במלאי`, `הוזמן בטלפון`
- **הערות** — long text (optional in the form)

Override field names with `VITE_PROJECT_MATERIALS_FIELD_*` in `.env` if needed.

**Production projects table** (dropdown only):
- Linked from the form; display uses `VITE_PRODUCTION_PROJECTS_FIELD` and optional client field.

### 4. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Two separate URLs (no form switcher)

- **Materials form (חומרי גלם לתיק ייצור):** open the **root URL** (e.g. `https://your-app.com/?baseId=appXXXX`).
- **Supplier order form (הזמנה חדשה מספק):** open **`/supplier-order`** (e.g. `https://your-app.com/supplier-order?baseId=appXXXX`).
- **Quote form (הצעת מחיר):** open **`/quote`** (e.g. `https://your-app.com/quote?baseId=appXXXX`).

`baseId` must match `VITE_AIRTABLE_BASE_ID` (your Airtable app id). An optional `&tableId=...` in the URL is ignored by the gate.

Use each URL in its own place in the Airtable interface (e.g. different buttons or links).

### Quote form — loading contacts (customer-first)

Contacts for the **איש קשר** dropdown are loaded **only from the Customer record**: the app reads the linked Contact record ids from a field **on the Customers table**, then fetches each Contact row. It does **not** filter the Contacts table by a “contact → customer” link.

**Required in `.env` (in addition to base/key and table ids):**

```env
VITE_CUSTOMERS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_CONTACTS_TABLE_ID=tblXXXXXXXXXXXXXX

# Field on Customers that links to Contacts (field name or fldXXXXXXXXXXXXXX)
VITE_CUSTOMER_CONTACTS_LINK_FIELD=אנשי קשר

# Optional: display fields on Contacts (defaults: שם, אימייל, טלפון). Use fld… if needed.
# VITE_CONTACT_NAME_FIELD=שם
# VITE_CONTACT_EMAIL_FIELD=אימייל
# VITE_CONTACT_PHONE_FIELD=טלפון
```

`VITE_CONTACT_CUSTOMER_LINK_FIELD` and `VITE_CONTACT_CUSTOMER_LINK_MULTIPLE` are **not** used for loading quote contacts anymore (they applied to the old “filter Contacts by formula” approach).

## Usage

### Multi-record form (חומרים לפרויקט) — root URL `/`

1. The form loads production projects from Airtable
2. For each row, fill:
   - **פרויקט ייצור** (required)
   - **שם חומר** (required)
   - **מידה** (optional)
   - **כמות** (required)
   - **במלאי** — במלאי / לא במלאי / הוזמן בטלפון (required)
   - **הערות** (optional)
3. Click **"+ הוסף רשומה נוספת"** to add more rows (new rows copy the first row’s project)
4. Click **"צור X רשומה/ות"** to create records in Airtable (batches of up to 10)

### Supplier order form (הזמנה חדשה מספק) — URL `/supplier-order`

The page looks like a single **order document**: title "הזמנת ספק", recipient (supplier), date, then an order table and notes.

1. Open the **supplier order** URL (e.g. `.../supplier-order?baseId=appXXXX`).
2. At the top: choose **לכבוד** (supplier), **תאריך**, and optionally **מסמכים מצורפים** (URL).
3. In the **order table**: each row is one line. Fill **חומר גלם / תיאור**, **מידות**, **כמות**, **הערות**. (Line status is not shown on the order doc—it is stored in Airtable only, default "פעיל".)
4. Use **"הוסף שורה"** to add more lines.
5. Fill **הערות** and check the **חומרי גלם (סיכום)** summary.
6. Choose an action:
   - **"צור ושמור ב-Airtable"** — creates the order in Airtable and, when the backend is configured, generates the order document, uploads to Drive, and saves the link in **טופס הזמנה** (no download).
   - **"צור ושלח לספק"** — creates the order and, when the backend is configured, uploads the PDF and sends it to the supplier by email.

Without a PDF backend, both buttons only create the order in Airtable (one record in **הזמנות מספקים** and one per line in **שורות הזמנת ספק**).

### Supplier quote request (בקשת הצעת מחיר) — URL `/supplier-quote-request`

1. Choose **תיק ייצור**, then select **חומרים** from that project’s rows in **חומרי גלם לתיק ייצור**.
2. Select one or more **ספקים**; edit **מייל** / **טלפון** per supplier if needed (for your use; not emailed automatically unless you add that later).
3. Submit — for **each supplier** the backend copies the Google Doc template `supplier_quote_demand` (same placeholders/table as orders: `{{supplierName}}`, `{{date}}`, `{{LINE_ROW}}`, optional `{{notes}}`), exports PDF, and creates a row in **בקשת הצעת מחיר מספק** with **חומרי גלם**, **תיק ייצור**, **טופס הזמנה** (PDF URL), and **ספק**.

Server env: `AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID`, `GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID` (see `server/.env.example`). Frontend: `VITE_SUPPLIERS_PHONE_FIELD` if your phone column is not `טלפון`.

## Customization

### Changing Field Names

Override Airtable field names in `.env` (see `mapProjectMaterialToAirtable` in `src/services/airtable.js`):

```env
VITE_PROJECT_MATERIALS_FIELD_PROJECT=תיק ייצור
VITE_PROJECT_MATERIALS_FIELD_NAME=שם חומר
VITE_PROJECT_MATERIALS_FIELD_SIZE=מידה
VITE_PROJECT_MATERIALS_FIELD_QUANTITY=כמות
VITE_PROJECT_MATERIALS_FIELD_IN_STOCK=במלאי
VITE_PROJECT_MATERIALS_FIELD_NOTES=הערות
```

### Production project dropdown labels

```env
VITE_PRODUCTION_PROJECTS_FIELD=YourFieldName
VITE_PRODUCTION_PROJECTS_CLIENT_FIELD=לקוח
```

### Adding/Removing Fields

1. Update the initial state in `src/components/MultiRecordForm.jsx`
2. Add/remove form fields in the JSX
3. Update the field mapping in `src/services/airtable.js`
4. If adding dropdown fields, add corresponding fetch functions in `src/services/airtable.js`

### Styling

- Main styles: `src/index.css`
- App styles: `src/App.css`
- Form styles: `src/components/MultiRecordForm.css`

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Backend (supplier order PDF and email)

The **server** folder is a separate Node.js API used for:

- **POST /api/supplier-order/submit** — Full workflow for automations: create order + lines in Airtable, generate PDF, patch **טופס הזמנה**, email supplier (`action`: `"send"` default, or `"save"` for PDF only). See `server/README.md`.
- **POST /api/supplier-order/pdf** — Generate the order PDF from a Google Docs template, upload to Drive, patch **טופס הזמנה**, return `{ ok, pdfUrl }` (existing `orderId` required).
- **POST /api/supplier-order/send** — Same as pdf for an existing order, then email the supplier.

To use it:

1. **Configure the frontend**: In the root `.env`, set `VITE_PDF_API_BASE_URL` to your backend URL (e.g. `http://localhost:3001` for local dev).
2. **Run the backend**: See `server/README.md` for setup (Airtable, Google Drive service account, SMTP). Then:
   ```bash
   cd server && npm install && npm run dev
   ```
   By default the server runs on port **3001**.

## Deploy to Railway (Docker)

The project includes a **Dockerfile** for deployment. Railway will build the image and pass your **service variables as build arguments**, so the Airtable config is baked in at build time.

### Steps

1. **Push your code** to GitHub (ensure `.env` is in `.gitignore` and is not committed).

2. **Create a new project on [Railway](https://railway.app)** and connect your repo.

3. **Add a service** → choose **Dockerfile** (Railway will detect the `Dockerfile` in the repo).

4. **Add Variables** in the Railway service (Variables tab). Use the **exact same names** as in your `.env` so they are passed as build args:
   - `VITE_AIRTABLE_BASE_ID`
   - `VITE_AIRTABLE_API_KEY`
   - `VITE_PRODUCTION_PROJECTS_TABLE_ID`
   - `VITE_MATERIALS_TABLE_ID`
   - `VITE_AIRTABLE_TABLE_ID` (or `VITE_AIRTABLE_TABLE_NAME`)
   - `VITE_PRODUCTION_PROJECTS_FIELD` (optional)
   - `VITE_MATERIALS_FIELD` (optional)

5. **Deploy**. Railway will run `docker build` and pass these variables into the build, then serve the app on the assigned port.

### Local Docker build (optional)

To test the image locally with your env:

```bash
docker build \
  --build-arg VITE_AIRTABLE_BASE_ID="your-base-id" \
  --build-arg VITE_AIRTABLE_API_KEY="your-token" \
  --build-arg VITE_PRODUCTION_PROJECTS_TABLE_ID="tbl..." \
  --build-arg VITE_MATERIALS_TABLE_ID="tbl..." \
  --build-arg VITE_AIRTABLE_TABLE_ID="tbl..." \
  -t multi-record-form .
docker run -p 3000:3000 multi-record-form
```

Then open `http://localhost:3000`.

## Airtable API Limits

- Maximum 10 records per API request
- The app automatically handles batching for larger submissions
- Rate limits: 5 requests per second per base

## Security Notes

- Never commit your `.env` file to version control
- Keep your API key secure
- Consider using environment-specific API keys for different environments

## Access control (URL params gate)

The form only loads when the URL includes a `baseId` query param that matches `VITE_AIRTABLE_BASE_ID` (your Airtable app id). No backend—check is done in the browser. The destination table for writes is still configured via `VITE_AIRTABLE_TABLE_ID` in env (not required in the link).

**Link format for your Airtable interface:**

- Materials form: `https://your-app-url.com/?baseId=appXXXX`
- Supplier order form: `https://your-app-url.com/supplier-order?baseId=appXXXX`

Put each URL in the right place in Airtable (e.g. one button for materials, one for supplier orders).

**Testing locally:** e.g. `http://localhost:5173/?baseId=appXXX` or `http://localhost:5173/supplier-order?baseId=appXXX`. In development only, you can use `?from_airtable=1` to bypass the gate.

## Troubleshooting

### "אנא הגדר את Base ID של Airtable"
- Make sure your `.env` file exists and contains the correct values
- Restart the dev server after creating/updating `.env`

### "Airtable API error: 422"
- Check that your field names match your Airtable table columns exactly (including Hebrew characters)
- Verify that required fields are being provided
- Ensure dropdown values match exactly what's in your lookup tables

### "שגיאה בטעינת אפשרויות"
- Verify your table IDs (`VITE_PRODUCTION_PROJECTS_TABLE_ID`, `VITE_MATERIALS_TABLE_ID`) - they should start with `tbl`
- Check that the field names (`VITE_PRODUCTION_PROJECTS_FIELD`, `VITE_MATERIALS_FIELD`) exist in those tables
- Ensure your API key has read access to the lookup tables

### "Network error" / "שגיאת רשת"
- Check your internet connection
- Verify your API key is correct
- Ensure your Base ID and Table Name are correct
