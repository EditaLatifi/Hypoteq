# Contact Form Email Configuration - Fixed ✅

## Problem
The Outlook SMTP password contains special characters (`%` and `&`) that may cause authentication issues.

## Solution Options

### Option 1: Use Gmail (Recommended - Most Reliable)

1. **Create/Use a Gmail account** for sending emails (e.g., `hypoteq.notifications@gmail.com`)

2. **Enable 2-Step Verification**:
   - Go to https://myaccount.google.com/security
   - Enable "2-Step Verification"

3. **Generate App Password**:
   - Visit https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "Hypoteq Contact Form"
   - Copy the 16-character password (no spaces)

4. **Update `.env` file**:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

### Option 2: Keep Outlook but Fix Password

If you want to keep using Outlook, you have two options:

**A) Update Outlook Password** (remove special characters):
   - Go to your Outlook account settings
   - Change password to something without `%` or `&` characters
   - Update `.env` with new password

**B) Use OAuth2 with Outlook** (more complex but secure):
   - Requires Microsoft Azure AD app setup
   - Recommended for production

### Option 3: Use Resend.com (Free & Professional)

Resend is a modern email service with 100 free emails/day:

1. **Sign up**: https://resend.com/
2. **Get API Key**: Dashboard → API Keys
3. **Install**: Already configured in the updated route
4. **Update `.env`**:
```env
# Use Resend instead of SMTP
USE_RESEND=true
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

## Testing the Contact Form

After updating your `.env`:

1. Restart your development server:
```bash
npm run dev
```

2. Test the contact form at: http://localhost:3000/de/contact

3. Check the terminal for detailed logs:
   - ✅ = Success
   - ❌ = Error with details

## Current Configuration Status

Your `.env` currently has:
- SMTP_HOST: smtp-mail.outlook.com ✅
- SMTP_PORT: 587 ✅
- SMTP_USER: info@hypoteq.ch ✅
- SMTP_PASS: Contains special characters ⚠️

## Quick Fix (If Gmail option)

Replace these lines in `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=hypoteq.notifications@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

Replace `abcd efgh ijkl mnop` with your actual Gmail app password (16 characters, no spaces).
