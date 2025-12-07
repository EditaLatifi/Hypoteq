// Direct SMTP Test - bypassing .env to test credentials
const nodemailer = require('nodemailer');

// ⚠️ REPLACE THIS WITH YOUR APP PASSWORD FROM MICROSOFT 365
const APP_PASSWORD = '[?iGQg655W"'; // <-- UPDATE THIS!

async function testSMTP() {
  console.log('\n🔧 Testing SMTP Configuration (Direct)...\n');
  console.log('⚠️  IMPORTANT: You need to use an App Password from Microsoft 365!');
  console.log('📖 See SMTP_FIX_GUIDE.md for instructions\n');

  const config = {
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // false for STARTTLS
    auth: {
      user: 'info@hypoteq.ch',
      pass: APP_PASSWORD, // App password from Microsoft 365
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    requireTLS: true,
    debug: true,
    logger: true
  };

  console.log('Configuration:', {
    host: config.host,
    port: config.port,
    user: config.auth.user,
    pass: config.auth.pass.length > 0 ? '***' + config.auth.pass.slice(-4) : 'NOT SET'
  });

  const transporter = nodemailer.createTransport(config);

  try {
    console.log('\n🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');

    console.log('📧 Sending test email...');
    const info = await transporter.sendMail({
      from: '"HYPOTEQ Test" <info@hypoteq.ch>',
      to: 'info@hypoteq.ch',
      subject: 'SMTP Test - ' + new Date().toLocaleString(),
      text: 'This is a test email from the SMTP configuration test.',
      html: '<p>This is a <strong>test email</strong> from the SMTP configuration test.</p>'
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('\n✅ SMTP is working! Update your .env file with this password.\n');

  } catch (error) {
    console.error('\n❌ SMTP Error:', error.message);
    if (error.code) console.error('Error Code:', error.code);
    
    if (error.code === 'EAUTH') {
      console.error('\n📌 AUTHENTICATION FAILED!');
      console.error('   You need to use an App Password from Microsoft 365.');
      console.error('   See SMTP_FIX_GUIDE.md for step-by-step instructions.\n');
    }
    
    if (error.command) console.error('Failed Command:', error.command);
    if (error.response) console.error('Server Response:', error.response);
  }
}

testSMTP();
