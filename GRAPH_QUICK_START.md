# Quick Reference: Microsoft Graph Email Setup

## ✅ What's Been Done

1. **Installed Microsoft Graph SDK**
   ```bash
   npm install @microsoft/microsoft-graph-client @azure/identity isomorphic-fetch
   ```

2. **Updated Contact Form API** (`app/api/contact/route.ts`)
   - Added Microsoft Graph email sending function
   - Priority: Graph API → Resend → SMTP
   - Uses existing Azure AD credentials

3. **Configured Environment** (`.env`)
   - `USE_GRAPH=true` enabled
   - Using existing SharePoint credentials

4. **Created Test Scripts**
   - `test-graph.js` - Test Microsoft Graph API
   - `test-smtp-direct.js` - Test SMTP fallback

## ⚠️ What You Need to Do

### Add Mail.Send Permission (5 minutes)

1. **Go to Azure Portal**: https://portal.azure.com
2. **Azure Active Directory** → **App registrations**
3. **Find your app**: `1b09793e-1440-416f-8750-56474ca2c1b3`
4. **API permissions** → **Add permission**
5. **Microsoft Graph** → **Application permissions** → **Mail.Send**
6. **Grant admin consent** ← CRITICAL STEP!

### Test It

```bash
# Test Graph API
node test-graph.js

# If successful, start dev server
npm run dev
```

## 🎯 Current Status

**Authentication**: ✅ Working  
**Permissions**: ❌ Need Mail.Send  
**Code**: ✅ Ready  

## 📊 Email Sending Priority

```
1. Microsoft Graph API (USE_GRAPH=true)
   ↓ (if fails or not configured)
2. Resend (USE_RESEND=true)
   ↓ (if fails or not configured)
3. SMTP (fallback)
```

## 🔧 Environment Variables

```env
# Microsoft Graph (Recommended)
USE_GRAPH=true
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret

# Email Configuration
SMTP_USER=your-email@domain.com
SMTP_TO=recipient@domain.com

# Alternative: Resend (if Graph not available)
# USE_RESEND=true
# RESEND_API_KEY=re_xxxxx
```

## 📖 Documentation

- **Full Setup Guide**: `GRAPH_API_SETUP.md`
- **SMTP Fallback Guide**: `SMTP_FIX_GUIDE.md`

## 🚀 Benefits of Microsoft Graph

✅ No SMTP passwords needed  
✅ Uses existing Azure AD credentials  
✅ More secure (OAuth2)  
✅ Enterprise-grade reliability  
✅ Emails appear in Sent Items  
✅ Better error handling  

## 🆘 Troubleshooting

**Error: Access Denied (403)**
→ Add Mail.Send permission and grant admin consent

**Error: User not found (404)**
→ Verify SMTP_USER email exists in M365 tenant

**Can't grant admin consent?**
→ Contact your IT admin or use Resend instead

## ✨ After Setup

Once working:
1. Remove SMTP_PASS from .env (not needed!)
2. Test contact form thoroughly
3. Monitor emails in sent items
4. Update documentation if needed

---

**Test Command**: `node test-graph.js`  
**Azure Portal**: https://portal.azure.com  
**Your App ID**: `1b09793e-1440-416f-8750-56474ca2c1b3`
