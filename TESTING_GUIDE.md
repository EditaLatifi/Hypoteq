# Auto-Response Email Testing Guide

## ✅ Text Verification Complete

All auto-response emails have been verified to match your exact specifications:

### 1. Contact Form ✓
- **Subject**: `Vielen Dank für deine Anfrage bei HYPOTEQ · Merci pour ta demande · Grazie per la tua richiesta · Thank you for your message`
- **Content**: Matches exactly ✓

### 2. Partner Form ✓
- **Subject**: `Vielen Dank für dein Interesse an einer Partnerschaft · Merci pour ton intérêt pour un partenariat · Grazie per il tuo interesse · Thank you for your interest in a partnership`
- **Content**: Matches exactly ✓

### 3. Funnel (Mortgage) ✓
- **Subject**: `Deine Hypothekaranfrage ist eingegangen · Ta demande d'hypothèque a été reçue · La tua richiesta ipotecaria è stata ricevuta · Your mortgage request has been received`
- **Content**: Matches exactly ✓

### Signature (All Forms) ✓
```
Beste Grüsse / Meilleures salutations / Cordiali saluti / Best regards

Dein HYPOTEQ Team

Marco Circelli
HYPOTEQ AG

📞 +41 44 502 92 52
✉️ marco.circelli@hypoteq.ch
🌐 www.hypoteq.ch
```

---

## 🧪 How to Test

### Prerequisites
1. ✅ Development server must be running
2. ✅ Email service configured in `.env` file
3. ✅ Database connected (for funnel test)

### Method 1: Test Individual Forms

#### Test Contact Form
```powershell
node test-contact-autoresponse.js
```

Before running, edit the file and change:
```javascript
email: 'test@example.com', // Change to YOUR email
```

#### Test Partner Form
```powershell
node test-partner-autoresponse.js
```

Before running, edit the file and change:
```javascript
email: 'partner@example.com', // Change to YOUR email
```

#### Test Funnel Form
```powershell
node test-funnel-autoresponse.js
```

Before running, edit the file and change:
```javascript
email: 'funnel@example.com', // Change to YOUR email
```

---

### Method 2: Test All Forms at Once

```powershell
node test-all-autoresponses.js
```

**IMPORTANT**: Before running, edit `test-all-autoresponses.js` and change:
```javascript
const TEST_EMAIL = 'your-email@example.com'; // CHANGE THIS!
```

This will test all three forms sequentially and provide a comprehensive report.

---

## 📧 What to Expect

After running the tests, you should receive emails at the specified address:

### Contact Form Email
- **Subject**: Multilingual thank you message
- **Body**: 
  - German section with greeting "Hi [FirstName],"
  - French section with greeting "Salut [FirstName],"
  - Italian section with greeting "Ciao [FirstName],"
  - English section with greeting "Hi [FirstName],"
  - Full signature with Marco Circelli details

### Partner Form Email
- **Subject**: Multilingual partnership interest confirmation
- **Body**: Same 4-language structure with partnership-specific messaging

### Funnel Email
- **Subject**: Multilingual mortgage request confirmation
- **Body**: Same 4-language structure with mortgage-specific messaging

---

## 🔍 Verification Checklist

For each email received, verify:

- [ ] **Subject Line**: Contains all 4 languages separated by ·
- [ ] **Personalization**: First name appears in greetings
- [ ] **German Section**: Text matches specification exactly
- [ ] **French Section**: Text matches specification exactly
- [ ] **Italian Section**: Text matches specification exactly
- [ ] **English Section**: Text matches specification exactly
- [ ] **Signature Line**: "Beste Grüsse / Meilleures salutations / Cordiali saluti / Best regards"
- [ ] **Team Name**: "Dein HYPOTEQ Team"
- [ ] **Contact Details**: Marco Circelli with all 4 contact methods
- [ ] **Professional Design**: Clean HTML layout with HYPOTEQ branding
- [ ] **Responsive**: Looks good on desktop and mobile

---

## 🚀 Quick Start Testing

### Step 1: Start Development Server
```powershell
npm run dev
```

Wait for the server to start (usually at http://localhost:3000)

### Step 2: Run Comprehensive Test
```powershell
# Edit test-all-autoresponses.js first (change TEST_EMAIL)
node test-all-autoresponses.js
```

### Step 3: Check Your Email
Look for 3 emails in your inbox (or spam folder):
1. Contact form confirmation
2. Partner form confirmation  
3. Mortgage funnel confirmation

---

## 🐛 Troubleshooting

### "Connection Refused" Error
**Problem**: Server is not running
**Solution**: Start the dev server with `npm run dev`

### "Email not configured" Warning
**Problem**: Missing email credentials in `.env`
**Solution**: Add required email configuration:
```env
USE_GRAPH=true
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret
SMTP_USER=your-email@hypoteq.ch
```

### No Email Received
**Possible causes**:
1. Check spam/junk folder
2. Verify email service is working (check server logs)
3. Confirm auto-response wasn't blocked by email filters
4. Check server console for error messages

### Database Error (Funnel Test Only)
**Problem**: Database connection failed
**Solution**: Verify database is running and `DATABASE_URL` is set correctly in `.env`

---

## 📊 Test Output Example

```
🧪 Testing Contact Form Auto-Response...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 Response Status: 200
📋 Response Data: { success: true }

✅ SUCCESS! Contact form submitted successfully.
📧 Check the email inbox for: test@example.com

📝 Expected Auto-Response:
   Subject: Vielen Dank für deine Anfrage bei HYPOTEQ · Merci pour ta demande · Grazie per la tua richiesta · Thank you for your message
   Content: Multilingual thank you message in DE, FR, IT, EN
   Signature: Marco Circelli contact details
```

---

## 📝 Test Files Created

1. **test-contact-autoresponse.js** - Tests contact form only
2. **test-partner-autoresponse.js** - Tests partner form only
3. **test-funnel-autoresponse.js** - Tests funnel form only
4. **test-all-autoresponses.js** - Comprehensive test suite for all forms

---

## ✨ Production Testing

To test in production (after deployment):

1. Edit test files and change `BASE_URL`:
   ```javascript
   const BASE_URL = 'https://your-production-domain.com';
   ```

2. Run the tests as usual
3. Verify emails are sent from production environment

---

## 🎯 Success Criteria

All tests pass when:
- ✅ Server responds with `success: true`
- ✅ Three emails are received
- ✅ All subject lines are multilingual
- ✅ All email bodies contain 4 language sections
- ✅ Personalization works (first name in greetings)
- ✅ Signature includes complete contact information
- ✅ Emails are properly formatted (HTML)
- ✅ No errors in server console

---

## 📞 Support

If tests fail:
1. Check server logs for detailed error messages
2. Verify all environment variables are set
3. Ensure email service has proper permissions
4. Test email service separately (send manual test email)

**Last Updated**: December 2, 2025
