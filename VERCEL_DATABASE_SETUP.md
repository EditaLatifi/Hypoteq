# 🚀 Vercel Database Configuration Guide

## ⚠️ Problem
The PostgreSQL URL is not working in Vercel because:
1. **Missing SSL parameters** - Supabase requires SSL connections
2. **Wrong port for serverless** - Need connection pooling (port 6543) instead of direct connection (port 5432)

---

## ✅ Solution: Use Connection Pooling URL

### For Vercel (Production/Serverless):

Use the **connection pooling URL** with port **6543**:

```
postgresql://postgres:ES@theeksperts2025@db.akrfboftdpgujyybcets.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
```

### For Local Development:

Use the **direct connection URL** with port **5432**:

```
postgresql://postgres:ES@theeksperts2025@db.akrfboftdpgujyybcets.supabase.co:5432/postgres?sslmode=require
```

---

## 🔧 Steps to Fix in Vercel

### 1. Go to Vercel Dashboard
- Visit: https://vercel.com
- Select your project: **Hypoteq**

### 2. Update Environment Variables
- Go to: **Settings** → **Environment Variables**
- Find: `DATABASE_URL`
- Click **Edit**

### 3. Update the Value
Replace with the **connection pooling URL**:

```
postgresql://postgres:ES@theeksperts2025@db.akrfboftdpgujyybcets.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
```

### 4. Apply to All Environments
Make sure it's set for:
- ✅ Production
- ✅ Preview
- ✅ Development

### 5. Redeploy
- Go to **Deployments**
- Click on the latest deployment
- Click **Redeploy** → **Use existing Build Cache**

---

## 📝 Key Differences

| Feature | Direct Connection (5432) | Pooling (6543) |
|---------|--------------------------|----------------|
| Port | 5432 | **6543** |
| Best for | Local development | **Serverless/Vercel** |
| Connection limit | Lower | Higher |
| Parameter | `sslmode=require` | `pgbouncer=true&sslmode=require` |

---

## 🔐 Other Required Environment Variables for Vercel

Make sure these are also set in Vercel:

### SharePoint Configuration:
```
SHAREPOINT_TENANT_ID=<your-tenant-id>
SHAREPOINT_CLIENT_ID=<your-client-id>
SHAREPOINT_CLIENT_SECRET=<your-client-secret>
SHAREPOINT_SITE_ID=<your-site-id>
DRIVE_ID=<your-drive-id>
FOLDER_ID=<your-folder-id>
```

### Email Configuration:
```
USE_RESEND=false
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=fisnik.salihu@hypoteq.ch
SMTP_PASS=<your-password>
```

### Newsletter:
```
MAILCHIMP_API_KEY=<your-api-key>
MAILCHIMP_AUDIENCE_ID=<your-audience-id>
```

---

## 🧪 Test the Connection

After updating, you can test with:

```bash
# Install Prisma CLI globally (if not already)
npm install -g prisma

# Test the connection
npx prisma db pull

# Generate Prisma Client
npx prisma generate
```

---

## 🆘 Troubleshooting

### Error: "Connection timeout"
- ✅ Use port **6543** with `pgbouncer=true`
- ✅ Add `sslmode=require`

### Error: "SSL required"
- ✅ Add `?sslmode=require` to the end of the URL

### Error: "Too many connections"
- ✅ Switch from port 5432 to 6543 (connection pooling)

### Error: "Authentication failed"
- ✅ Check password has no special URL characters
- ✅ If password has `@` or `#`, URL-encode it:
  - `@` → `%40`
  - `#` → `%23`
  - Your current password is fine

---

## 📞 Need Help?

If issues persist:
1. Check Supabase dashboard: https://app.supabase.com
2. Verify database is running
3. Check connection pooling is enabled in Supabase settings

---

## ✅ Quick Copy-Paste for Vercel

**Use this URL in Vercel:**
```
postgresql://postgres:ES@theeksperts2025@db.akrfboftdpgujyybcets.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
```
