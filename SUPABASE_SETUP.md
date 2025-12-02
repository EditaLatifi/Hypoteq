# Supabase Database Setup Guide

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in:
   - **Project Name:** Hypoteq
   - **Database Password:** (create a strong password - save it!)
   - **Region:** Choose closest to your users
5. Click "Create new project"
6. Wait 2-3 minutes for setup to complete

## Step 2: Get Database Connection String

1. In your Supabase project dashboard, go to **Settings** → **Database**
2. Scroll down to **Connection string** section
3. Select **URI** tab
4. Copy the connection string (it looks like this):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password

## Step 3: Update Your .env File

Create a `.env` file in your project root:

```env
# Supabase Database Connection
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"

# Optional: Direct Connection (for migrations)
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"
```

## Step 4: Run Database Migration

### Option A: Using Supabase SQL Editor (Recommended)

1. Go to your Supabase project
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire content from `supabase-migration.sql`
5. Paste it into the SQL editor
6. Click **Run** or press `Ctrl+Enter`
7. Wait for "Success" message

### Option B: Using Prisma Migrate

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Or create migration
npx prisma migrate dev --name init
```

## Step 5: Verify Tables Created

1. In Supabase, go to **Table Editor**
2. You should see all tables:
   - Inquiry
   - Client
   - Project
   - Property
   - Firma
   - Borrower
   - Financing
   - Kreditnehmer
   - Document

## Step 6: Set Up Row Level Security (Optional but Recommended)

In Supabase SQL Editor, run:

```sql
-- Enable RLS on all tables
ALTER TABLE "Inquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Firma" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Borrower" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Financing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Kreditnehmer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;

-- Create policies (example - allow all for authenticated users)
-- Adjust based on your security requirements

CREATE POLICY "Allow all operations for authenticated users" ON "Inquiry"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Client"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Project"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Property"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Firma"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Borrower"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Financing"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Kreditnehmer"
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON "Document"
    FOR ALL
    USING (auth.role() = 'authenticated');
```

## Step 7: Test Connection

Run this command to test your connection:

```bash
npx prisma db pull
```

If successful, you should see: "✔ Introspected 9 models and wrote them into prisma/schema.prisma"

## Step 8: Update Your Application

Your application is already configured to use `process.env.DATABASE_URL`, so once the `.env` file is set up, everything should work!

## Important Security Notes

⚠️ **Never commit your `.env` file to Git!**

Add this to your `.gitignore`:
```
.env
.env.local
.env*.local
```

## Troubleshooting

### Connection Refused Error
- Make sure you replaced `[YOUR-PASSWORD]` with your actual password
- Check if your IP is allowed (Supabase allows all by default)
- Verify the connection string format

### SSL Error
Add `?sslmode=require` to the end of your connection string:
```
DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres?sslmode=require"
```

### Prisma Client Error
Run: `npx prisma generate` to regenerate the client

## Next Steps

Once setup is complete:

1. ✅ Database is running on Supabase
2. ✅ All tables are created
3. ✅ Your app can submit inquiries
4. ✅ You can view data in Supabase dashboard

## Viewing Your Data

Go to Supabase → **Table Editor** → Select any table to view/edit data in a spreadsheet-like interface!
