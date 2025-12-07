# Microsoft Graph API Setup Guide for Email Sending

## Current Status
✅ Azure AD App is configured and authenticating successfully  
❌ Missing `Mail.Send` permission

## Why Use Microsoft Graph Instead of SMTP?
- ✅ **No app passwords needed** - Uses existing Azure AD credentials
- ✅ **More secure** - OAuth2 authentication
- ✅ **Better reliability** - No SMTP authentication issues
- ✅ **Same credentials** - Already used for SharePoint access
- ✅ **Enterprise-ready** - Recommended by Microsoft for M365

## Steps to Enable Email Sending

### 1. Go to Azure Portal
Visit: https://portal.azure.com

### 2. Navigate to App Registration
1. Click on **Azure Active Directory** (left sidebar)
2. Click on **App registrations**
3. Find your app with Client ID: `1b09793e-1440-416f-8750-56474ca2c1b3`
   - Or search for it by name

### 3. Add API Permissions
1. In your app, click **API permissions** (left sidebar)
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions** (NOT Delegated)
5. Search for and select:
   - ✅ `Mail.Send` - Send mail as any user
6. Click **Add permissions**

### 4. Grant Admin Consent
⚠️ **IMPORTANT**: This step requires admin privileges
1. After adding the permission, you'll see it in the list
2. Click **Grant admin consent for [Your Organization]**
3. Confirm by clicking **Yes**
4. Wait for the status to show green checkmark "Granted for [Your Organization]"

### 5. Verify Permissions
Your API permissions should look like this:
```
Microsoft Graph (Application):
- Mail.Send ✅ Granted for [Organization]
- Files.ReadWrite.All ✅ Granted for [Organization] (already exists)
- Sites.ReadWrite.All ✅ Granted for [Organization] (already exists)
```

### 6. Test the Configuration
After granting permissions, run the test script:
```bash
node test-graph.js
```

You should see:
```
✅ Email sent successfully via Microsoft Graph API!
📬 Check info@hypoteq.ch for the test email
```

### 7. Restart Your Application
```bash
npm run dev
```

## Your .env Configuration

Your `.env` should be configured like this:
```env
USE_GRAPH=true
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret
SMTP_USER=your-email@domain.com
SMTP_TO=recipient@domain.com
```

## How It Works

1. Contact form is submitted
2. API checks if `USE_GRAPH=true`
3. Authenticates with Azure AD using client credentials
4. Sends email via Microsoft Graph API as `info@hypoteq.ch`
5. Email appears in sent items of the mailbox

## Fallback Options

The system has automatic fallback:
```
Microsoft Graph (best) → Resend → SMTP
```

If Graph fails, it will try other methods automatically.

## Troubleshooting

### "Insufficient privileges to complete the operation"
- The `Mail.Send` permission is not granted
- Follow steps 3-4 above
- Make sure you grant **admin consent**

### "401 Unauthorized"
- Check that credentials in `.env` are correct
- Verify the client secret hasn't expired

### "404 Not Found" or "User not found"
- Make sure `SMTP_USER` email exists in your M365 tenant
- The sending user must be a valid mailbox

### Need Admin Access?
If you don't have admin access to Azure AD:
1. Contact your IT administrator
2. Ask them to grant `Mail.Send` permission to your app
3. Or use **Resend** as an alternative (set `USE_RESEND=true`)

## Testing Checklist

- [ ] Logged into Azure Portal
- [ ] Found the app registration
- [ ] Added `Mail.Send` (Application) permission
- [ ] Granted admin consent
- [ ] Ran `node test-graph.js` successfully
- [ ] Received test email
- [ ] Tested contact form on website
- [ ] Email received from contact form

## Next Steps

Once permissions are granted:
1. Run `node test-graph.js` to verify
2. Test the contact form on your website
3. Check emails are being received
4. Remove `SMTP_PASS` from `.env` (no longer needed!)

---

**Need Help?** 
- Azure AD Admin Portal: https://portal.azure.com
- Microsoft Graph Permissions Reference: https://docs.microsoft.com/en-us/graph/permissions-reference
