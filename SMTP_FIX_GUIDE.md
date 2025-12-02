# SMTP Authentication Fix Guide

## Problem
Error: `535 5.7.139 Authentication unsuccessful, the user credentials were incorrect`

## Solution: Use App Password for Microsoft 365

Microsoft 365/Outlook accounts require **App Passwords** for SMTP authentication, not your regular email password.

### Steps to Generate an App Password:

1. **Go to Microsoft Account Security**
   - Visit: https://account.microsoft.com/security
   - Sign in with fisnik.salihu@hypoteq.ch

2. **Enable Two-Factor Authentication (if not already enabled)**
   - You must have 2FA enabled to create app passwords
   - Go to "Advanced security options"
   - Set up 2FA using the Microsoft Authenticator app or SMS

3. **Create an App Password**
   - Still in "Advanced security options"
   - Scroll to "App passwords"
   - Click "Create a new app password"
   - Name it something like "HYPOTEQ Website SMTP"
   - **Copy the generated password** (it will look like: xxxx-xxxx-xxxx-xxxx)

4. **Update the .env file**
   ```bash
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx
   ```
   Replace the current password with the app password (no quotes needed)

5. **Restart your development server**
   ```bash
   npm run dev
   ```

### Alternative: Use Azure AD App Registration (More Secure)

If the organization has disabled app passwords, you'll need to use OAuth2:

1. Register an app in Azure AD
2. Grant Mail.Send permissions
3. Use the client credentials flow

### Quick Test After Update

Run this command to test the new app password:
```bash
node test-smtp-direct.js
```

### Update Your .env File

After getting the app password, your .env should look like:
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=fisnik.salihu@hypoteq.ch
SMTP_PASS=your-app-password-here
SMTP_FROM=fisnik.salihu@hypoteq.ch
SMTP_TO=fisnik.salihu@hypoteq.ch
```

## Common Issues

### "App passwords not available"
- Your organization might have disabled app passwords
- Contact your IT admin or use OAuth2 authentication
- Alternative: Use a service like SendGrid, Resend, or Mailgun

### "Two-factor authentication required"
- App passwords require 2FA to be enabled first
- Follow Microsoft's guide to set up 2FA

### Still getting authentication errors?
1. Verify the email account is active
2. Check if the account has SMTP enabled
3. Try using your organization's Exchange server instead
4. Consider using Resend (already configured in your code)

## Using Resend Instead (Recommended)

Resend is easier and more reliable. To enable it:

1. Sign up at https://resend.com
2. Get your API key
3. Add to .env:
   ```
   USE_RESEND=true
   RESEND_API_KEY=re_your_api_key_here
   ```

Your contact form will automatically use Resend instead of SMTP!
