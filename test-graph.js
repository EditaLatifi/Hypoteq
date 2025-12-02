// Microsoft Graph API Test
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

// Your Azure AD credentials (from .env)
const TENANT_ID = process.env.GRAPH_TENANT_ID || "your-tenant-id";
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || "your-client-id";
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || "your-client-secret";
const SEND_FROM = process.env.SMTP_USER || "your-email@domain.com";
const SEND_TO = process.env.SMTP_TO || "your-email@domain.com";

async function testGraphAPI() {
  console.log('\n🔧 Testing Microsoft Graph API...\n');

  try {
    // Create Azure AD credential
    console.log('🔑 Creating Azure AD credential...');
    const credential = new ClientSecretCredential(
      TENANT_ID,
      CLIENT_ID,
      CLIENT_SECRET
    );

    // Initialize Graph client
    console.log('🔗 Initializing Graph client...');
    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          console.log('✅ Access token obtained');
          return token?.token || "";
        },
      },
    });

    // Test: Get user info to verify access
    console.log('\n📋 Testing API access - Getting user info...');
    try {
      const user = await client.api(`/users/${SEND_FROM}`).get();
      console.log('✅ User found:', user.displayName, `(${user.mail})`);
    } catch (userError) {
      console.log('⚠️  Could not get user info:', userError.message);
    }

    // Send test email
    console.log('\n📧 Sending test email...');
    
    const emailHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background-color: #132219; color: #CAF476; padding: 20px; text-align: center; }
            .content { padding: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Test Email - Microsoft Graph API</h1>
          </div>
          <div class="content">
            <p><strong>This is a test email sent via Microsoft Graph API</strong></p>
            <p>Time: ${new Date().toLocaleString('de-CH')}</p>
            <p>If you receive this, Microsoft Graph is working correctly! ✅</p>
          </div>
        </body>
      </html>
    `;

    const sendMail = {
      message: {
        subject: `Graph API Test - ${new Date().toLocaleString()}`,
        body: {
          contentType: "HTML",
          content: emailHTML,
        },
        toRecipients: [
          {
            emailAddress: {
              address: SEND_TO,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    await client
      .api(`/users/${SEND_FROM}/sendMail`)
      .post(sendMail);

    console.log('✅ Email sent successfully via Microsoft Graph API!');
    console.log(`📬 Check ${SEND_TO} for the test email\n`);

  } catch (error) {
    console.error('\n❌ Microsoft Graph Error:', error.message);
    
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    
    if (error.statusCode === 403) {
      console.error('\n📌 PERMISSION DENIED!');
      console.error('   Your Azure AD app needs the following permission:');
      console.error('   - Mail.Send (Application permission)');
      console.error('\n   Steps to fix:');
      console.error('   1. Go to Azure Portal: https://portal.azure.com');
      console.error('   2. Navigate to Azure Active Directory > App registrations');
      console.error('   3. Select your app:', CLIENT_ID);
      console.error('   4. Go to "API permissions"');
      console.error('   5. Add "Mail.Send" (Application permission) from Microsoft Graph');
      console.error('   6. Grant admin consent\n');
    }

    if (error.statusCode === 401) {
      console.error('\n📌 AUTHENTICATION FAILED!');
      console.error('   Check your credentials:');
      console.error('   - Tenant ID:', TENANT_ID);
      console.error('   - Client ID:', CLIENT_ID);
      console.error('   - Client Secret: ***' + CLIENT_SECRET.slice(-4));
    }

    console.error('\nFull error:', error);
  }
}

testGraphAPI();
