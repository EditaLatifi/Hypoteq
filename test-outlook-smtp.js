// Test script for Outlook SMTP configuration
const nodemailer = require('nodemailer');
require('dotenv').config({ path: '.env.local' });

async function testEmail() {
  console.log('🧪 Testing Outlook SMTP Configuration...\n');
  
  console.log('📧 Configuration:');
  console.log('   Host:', process.env.SMTP_HOST);
  console.log('   Port:', process.env.SMTP_PORT);
  console.log('   User:', process.env.SMTP_USER);
  console.log('   Password:', process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : 'NOT SET');
  console.log('');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    debug: true,
    logger: true
  });

  try {
    console.log('🔌 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');

    console.log('📤 Sending test email...');
    const info = await transporter.sendMail({
      from: `"HYPOTEQ Test" <${process.env.SMTP_USER}>`,
      to: 'info@hypoteq.ch',
      subject: 'Test Email from HYPOTEQ Contact Form',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <div style="background-color: #CAF476; padding: 20px; border-radius: 10px;">
            <h1 style="color: #132219; margin: 0;">✅ Test Email Successful!</h1>
          </div>
          <div style="padding: 20px; margin-top: 20px; background-color: #f9f9f9; border-radius: 10px;">
            <p>This is a test email from your HYPOTEQ contact form configuration.</p>
            <p><strong>Configuration Details:</strong></p>
            <ul>
              <li>SMTP Host: ${process.env.SMTP_HOST}</li>
              <li>SMTP Port: ${process.env.SMTP_PORT}</li>
              <li>From: ${process.env.SMTP_USER}</li>
              <li>To: info@hypoteq.ch</li>
            </ul>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Sent at: ${new Date().toLocaleString('de-CH')}
            </p>
          </div>
        </div>
      `,
      text: `
Test Email from HYPOTEQ Contact Form

This is a test email to verify your Outlook SMTP configuration is working correctly.

Configuration:
- SMTP Host: ${process.env.SMTP_HOST}
- SMTP Port: ${process.env.SMTP_PORT}
- From: ${process.env.SMTP_USER}
- To: info@hypoteq.ch

Sent at: ${new Date().toLocaleString('de-CH')}
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log('📬 Message ID:', info.messageId);
    console.log('📝 Response:', info.response);
    console.log('\n🎉 Email configuration is working correctly!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Verify the email and password are correct');
    console.error('   2. Check if 2FA is enabled (you may need an app password)');
    console.error('   3. Ensure SMTP is enabled for this account');
    console.error('   4. Check firewall/network settings');
  }
}

testEmail();
