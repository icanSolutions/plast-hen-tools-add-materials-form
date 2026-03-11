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

# Lookup Tables - use Table IDs (tblXXXXXXXXXXXXXX)
VITE_PRODUCTION_PROJECTS_TABLE_ID=tblXXXXXXXXXXXXXX
VITE_MATERIALS_TABLE_ID=tblXXXXXXXXXXXXXX

# Field names in lookup tables (the field that contains values to display)
VITE_PRODUCTION_PROJECTS_FIELD=Name
VITE_MATERIALS_FIELD=Name

# Optional: comma-separated origins allowed for referrer gate (default: Airtable)
# VITE_ALLOWED_REFERRER_ORIGINS=https://airtable.com,https://app.airtable.com
```

**Finding Table IDs:**
- Open your base in Airtable and go to **Help** → **API documentation**
- Or: The table ID appears in the URL when you copy a table link (starts with `tbl`)
- Base ID starts with `app`, Table ID starts with `tbl`

### 3. Configure Your Airtable Tables

**Main Table** (where records will be created):
- Must have fields: `פרויקט ייצור`, `חומר`, `כמות`
- Update field names in `src/services/airtable.js` if your fields have different names

**Lookup Tables** (for dropdown options):
- **Production Projects Table**: Contains the list of production projects
- **Materials Table**: Contains the list of materials
- Both tables should have a field (default: `Name`) that contains the values to display in dropdowns
- Update `VITE_PRODUCTION_PROJECTS_FIELD` and `VITE_MATERIALS_FIELD` in `.env` if your field names differ

### 4. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Usage

1. The form loads dropdown options from your Airtable tables automatically
2. Fill in the form fields for the first record:
   - Select a production project from the dropdown
   - Select a material from the dropdown
   - Enter a quantity (number)
3. Click the "+ הוסף רשומה נוספת" button to add more records
4. Fill in all the records you want to create
5. Click "צור X רשומה/ות" to submit all records to Airtable
6. Records will be created in batches (up to 10 at a time)

## Customization

### Changing Field Names

Edit `src/services/airtable.js` and update the field mapping in the `createRecords` function:

```javascript
fields: {
  'פרויקט ייצור': record.productionProject,
  'חומר': record.material,
  'כמות': record.quantity ? Number(record.quantity) : 0,
}
```

### Changing Lookup Table Field Names

If your lookup tables use different field names (not "Name"), update the `.env` file:

```env
VITE_PRODUCTION_PROJECTS_FIELD=YourFieldName
VITE_MATERIALS_FIELD=YourFieldName
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

The form only loads when the URL includes `baseId` and `tableId` query params that match your Airtable base and destination table (the same values as `VITE_AIRTABLE_BASE_ID` and `VITE_AIRTABLE_TABLE_ID` in your env). No backend—check is done in the browser.

**Link format for your Airtable button:**

```
https://your-app-url.com?baseId=appXXXX&tableId=tblYYYY
```

Replace `appXXXX` and `tblYYYY` with your actual base ID and destination table ID (the same ones in your `.env`). Put this full URL in the Airtable button or link; only visitors who open this URL will see the form.

**Testing locally:** Use the same URL with your real base/table IDs, e.g. `http://localhost:5173/?baseId=appXXX&tableId=tblYYY`. In development only, you can also use `?from_airtable=1` to bypass the check and see the form without the params.

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
