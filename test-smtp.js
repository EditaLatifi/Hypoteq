// SMTP Test Script - Run with: node test-smtp.js
const nodemailer = require('nodemailer');
require('dotenv').config();

async function testSMTP() {
  console.log('\n🔧 Testing SMTP Configuration...\n');
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***configured***' : 'NOT SET');
  console.log('\n---\n');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
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
    console.log('🔍 Step 1: Verifying SMTP connection...\n');
    await transporter.verify();
    console.log('\n✅ SMTP connection verified successfully!\n');

    console.log('📧 Step 2: Sending test email...\n');
    const info = await transporter.sendMail({
      from: `"HYPOTEQ Test" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: 'Test Email from HYPOTEQ',
      text: 'This is a test email to verify SMTP configuration.',
      html: '<h1>Test Email</h1><p>This is a test email to verify SMTP configuration.</p>'
    });

    console.log('\n✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('\n✅ All tests passed! Your SMTP is working correctly.\n');

  } catch (error) {
    console.error('\n❌ SMTP Test Failed:');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    console.log('\n💡 Common issues:');
    console.log('   1. Wrong password - Try generating an App Password from Outlook');
    console.log('   2. 2FA enabled - Use app-specific password');
    console.log('   3. Less secure apps blocked - Enable in account settings');
    console.log('   4. Account locked - Check your email for security alerts\n');
  }
}

testSMTP();
