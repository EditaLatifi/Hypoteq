# Contact Form Email Setup

The contact form sends emails to **info@hypoteq.ch** with beautifully formatted HTML emails.

## 📧 Email Configuration

### 1. Update Environment Variables

Edit `.env.local` and add your SMTP credentials:

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-specific-password"
```

### 2. Gmail Setup (Recommended)

If using Gmail to send emails:

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (must be enabled)
3. Scroll down to **App passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password
6. Use this as `SMTP_PASS` in your `.env.local`

### 3. Alternative SMTP Providers

#### SendGrid
```env
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_USER="apikey"
SMTP_PASS="your-sendgrid-api-key"
```

#### Mailgun
```env
SMTP_HOST="smtp.mailgun.org"
SMTP_PORT="587"
SMTP_USER="your-mailgun-smtp-username"
SMTP_PASS="your-mailgun-smtp-password"
```

#### Office 365 / Outlook
```env
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="your-email@outlook.com"
SMTP_PASS="your-password"
```

## 📨 Email Format

The contact form sends a beautifully formatted HTML email with:

- ✅ Professional HYPOTEQ branding
- ✅ Clear inquiry type badge
- ✅ All contact information (name, company, email, phone)
- ✅ Message in a highlighted box
- ✅ Timestamp in Swiss format
- ✅ Reply-to set to sender's email
- ✅ Plain text fallback for email clients that don't support HTML

### Email Subject Format
```
Neue Kontaktanfrage: [Inquiry Type] - [First Name] [Last Name]
```

Example: `Neue Kontaktanfrage: Finanzierung - Max Mustermann`

## 🎨 Email Design

The HTML email includes:
- Dark header with HYPOTEQ branding
- Color-coded inquiry type badge (#CAF476 background)
- Organized sections for all form fields
- Clickable email and phone links
- Responsive design
- Professional footer with company address

## 🔧 API Endpoint

**POST** `/api/contact`

**Request Body:**
```json
{
  "firstName": "Max",
  "lastName": "Mustermann",
  "company": "Example AG",
  "email": "max@example.com",
  "phone": "+41 44 123 45 67",
  "inquiryType": "financing",
  "message": "Ich interessiere mich für eine Hypothek..."
}
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message"
}
```

## ✅ Form Validation

The contact form includes validation for:
- ✅ Required fields (first name, last name, email, phone, inquiry type, message)
- ✅ Email format validation
- ✅ Swiss phone number format (+41 or 0)
- ✅ Real-time error clearing
- ✅ Submit button disabled during sending

## 🚀 Testing

1. Fill out the contact form at `/de/contact`
2. Submit the form
3. Check the inbox of **info@hypoteq.ch**
4. Verify the email is properly formatted
5. Test the reply-to functionality

## 📝 Note

Make sure to:
- Keep SMTP credentials secure (never commit `.env.local` to git)
- Test email delivery in development before deploying
- Configure SPF/DKIM records for production email delivery
- Monitor email sending limits of your SMTP provider
