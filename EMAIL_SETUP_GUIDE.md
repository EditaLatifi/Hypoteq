# 📧 Email Configuration Guide for HYPOTEQ Contact Form

## Issue Detected
SMTP Authentication is currently **disabled** for your Office 365 tenant.

Error: `SmtpClientAuthentication is disabled for the Tenant`

---

## ✅ Solution: Enable SMTP AUTH in Microsoft 365

### Steps to Enable SMTP AUTH:

1. **Login to Microsoft 365 Admin Center**
   - Go to: https://admin.microsoft.com
   - Login with admin credentials

2. **Navigate to Exchange Admin Center**
   - Click on "Admin centers" → "Exchange"
   - OR go directly to: https://admin.exchange.microsoft.com

3. **Enable SMTP AUTH for the User**
   
   **Option A: Enable for Specific User (Recommended)**
   - Go to: Recipients → Mailboxes
   - Find and click on: **info@hypoteq.ch**
   - Click "Mail flow settings" or "Mailbox features"
   - Find "Authenticated SMTP" and **Enable** it
   - Click "Save"

   **Option B: Enable for Entire Tenant**
   - Go to: Mail flow → Policies → Authentication policies
   - Edit the default policy or create a new one
   - Enable "SMTP AUTH"
   - Apply to the user: info@hypoteq.ch

4. **Wait for Changes to Propagate**
   - Changes may take 5-30 minutes to take effect
   - Test again using: `node test-outlook-smtp.js`

---

## 🔐 Alternative: Use App Password (If 2FA is Enabled)

If Two-Factor Authentication (2FA) is enabled on the account:

1. **Generate an App Password**
   - Go to: https://myaccount.microsoft.com
   - Login as: info@hypoteq.ch
   - Navigate to: Security → App passwords
   - Click "Create a new app password"
   - Name it: "HYPOTEQ Contact Form"
   - Copy the generated password

2. **Update `.env.local`**
   ```env
   SMTP_PASS=<paste-the-app-password-here>
   ```

3. **Test Again**
   ```bash
   node test-outlook-smtp.js
   ```

---

## 🚀 Alternative Solution: Use Microsoft Graph API

If SMTP cannot be enabled, we can use Microsoft Graph API to send emails:

### Setup Steps:

1. **Register an App in Azure**
   - Go to: https://portal.azure.com
   - Navigate to: Azure Active Directory → App registrations
   - Click "New registration"
   - Name: "HYPOTEQ Contact Form"
   - Account types: "Single tenant"
   - Click "Register"

2. **Configure API Permissions**
   - In the app, go to: API permissions
   - Click "Add a permission"
   - Select: Microsoft Graph → Application permissions
   - Add: `Mail.Send`
   - Click "Grant admin consent"

3. **Create Client Secret**
   - Go to: Certificates & secrets
   - Click "New client secret"
   - Description: "HYPOTEQ Contact Form"
   - Expiry: 24 months
   - Click "Add"
   - **Copy the secret value immediately**

4. **Update `.env.local`**
   ```env
   USE_GRAPH_API=true
   MICROSOFT_TENANT_ID=<your-tenant-id>
   MICROSOFT_CLIENT_ID=<your-client-id>
   MICROSOFT_CLIENT_SECRET=<your-client-secret>
   MICROSOFT_USER_ID=info@hypoteq.ch
   ```

---

## 📝 Current Configuration

**Email:** info@hypoteq.ch
**SMTP Server:** smtp.office365.com
**Port:** 587
**TLS:** Enabled

---

## ✅ Testing

After making changes, test the configuration:

```bash
node test-outlook-smtp.js
```

---

## 📞 Need Help?

If you need assistance:
1. Contact your Microsoft 365 administrator
2. Visit: https://aka.ms/smtp_auth_disabled
3. Or use the Graph API alternative above

---

## 🔧 Quick Fix Commands

```bash
# Test current config
node test-outlook-smtp.js

# Restart dev server
npm run dev

# Test contact form
# Visit: http://localhost:3000/de/contact
```
