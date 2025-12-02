/**
 * Comprehensive Test Suite for All Auto-Responses
 * Tests all three forms: Contact, Partner, and Funnel
 */

const chalk = require('chalk');

// Test configuration
const TEST_EMAIL = 'your-email@example.com'; // CHANGE THIS to your email address
const BASE_URL = 'http://localhost:3000';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test 1: Contact Form
const testContactForm = async () => {
  console.log(chalk.blue('\n📋 TEST 1: Contact Form Auto-Response\n'));
  console.log(chalk.gray('━'.repeat(60)));

  const testData = {
    firstName: 'John',
    lastName: 'Doe',
    company: 'Test Company',
    email: TEST_EMAIL,
    phone: '+41 79 123 45 67',
    inquiryType: 'general',
    message: 'Test message for contact form auto-response.'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log(chalk.green('✅ Contact Form: PASSED'));
      console.log(chalk.yellow('📧 Expected email subject:'));
      console.log('   "Vielen Dank für deine Anfrage bei HYPOTEQ..."');
      return true;
    } else {
      console.log(chalk.red('❌ Contact Form: FAILED'));
      console.log(chalk.red(`   Error: ${result.error || 'Unknown'}`));
      return false;
    }
  } catch (error) {
    console.log(chalk.red('❌ Contact Form: ERROR'));
    console.log(chalk.red(`   ${error.message}`));
    return false;
  }
};

// Test 2: Partner Form
const testPartnerForm = async () => {
  console.log(chalk.blue('\n📋 TEST 2: Partner Form Auto-Response\n'));
  console.log(chalk.gray('━'.repeat(60)));

  const testData = {
    firstName: 'Jane',
    lastName: 'Smith',
    email: TEST_EMAIL,
    phone: '+41 79 987 65 43',
    message: 'Test message for partner form auto-response.'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/partner-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log(chalk.green('✅ Partner Form: PASSED'));
      console.log(chalk.yellow('📧 Expected email subject:'));
      console.log('   "Vielen Dank für dein Interesse an einer Partnerschaft..."');
      return true;
    } else {
      console.log(chalk.red('❌ Partner Form: FAILED'));
      console.log(chalk.red(`   Error: ${result.error || 'Unknown'}`));
      return false;
    }
  } catch (error) {
    console.log(chalk.red('❌ Partner Form: ERROR'));
    console.log(chalk.red(`   ${error.message}`));
    return false;
  }
};

// Test 3: Funnel Form
const testFunnelForm = async () => {
  console.log(chalk.blue('\n📋 TEST 3: Funnel (Mortgage) Auto-Response\n'));
  console.log(chalk.gray('━'.repeat(60)));

  const testData = {
    customerType: 'direct',
    client: {
      firstName: 'Max',
      lastName: 'Mustermann',
      email: TEST_EMAIL,
      phone: '+41 79 111 22 33',
      zip: '8001'
    },
    project: {
      projektArt: 'kauf',
      liegenschaftZip: '8001',
      kreditnehmerTyp: 'natuerlich'
    },
    property: {
      artImmobilie: 'Einfamilienhaus',
      artLiegenschaft: 'Wohneigentum',
      nutzung: 'Eigennutzung',
      renovation: 'nein',
      reserviert: 'ja',
      finanzierungsangebote: 'nein',
      kreditnehmer: [{
        vorname: 'Max',
        name: 'Mustermann',
        geburtsdatum: '1990-01-01',
        erwerb: 'angestellt',
        status: 'ledig'
      }]
    },
    financing: {
      kaufpreis: 800000,
      eigenmittel_bar: 200000,
      hypoBetrag: 600000,
      einkommen: 120000,
      modell: 'Festhypothek'
    }
  };

  try {
    const response = await fetch(`${BASE_URL}/api/inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log(chalk.green('✅ Funnel Form: PASSED'));
      console.log(chalk.yellow('📧 Expected email subject:'));
      console.log('   "Deine Hypothekaranfrage ist eingegangen..."');
      return true;
    } else {
      console.log(chalk.red('❌ Funnel Form: FAILED'));
      console.log(chalk.red(`   Error: ${result.error || 'Unknown'}`));
      return false;
    }
  } catch (error) {
    console.log(chalk.red('❌ Funnel Form: ERROR'));
    console.log(chalk.red(`   ${error.message}`));
    return false;
  }
};

// Main test runner
const runAllTests = async () => {
  console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   HYPOTEQ Auto-Response Email Test Suite                ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝'));
  
  console.log(chalk.white(`\n📧 Test emails will be sent to: ${chalk.yellow(TEST_EMAIL)}`));
  console.log(chalk.white(`🌐 Testing server: ${chalk.yellow(BASE_URL)}\n`));
  
  if (TEST_EMAIL === 'your-email@example.com') {
    console.log(chalk.red.bold('⚠️  WARNING: Please update TEST_EMAIL in this file!\n'));
    return;
  }

  const results = [];
  
  // Run tests with delays between them
  results.push(await testContactForm());
  await delay(2000);
  
  results.push(await testPartnerForm());
  await delay(2000);
  
  results.push(await testFunnelForm());
  
  // Summary
  console.log(chalk.cyan.bold('\n\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   Test Summary                                           ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝\n'));
  
  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;
  
  console.log(`Total Tests: ${chalk.blue(results.length)}`);
  console.log(`Passed: ${chalk.green(passed)}`);
  console.log(`Failed: ${chalk.red(failed)}`);
  
  if (passed === results.length) {
    console.log(chalk.green.bold('\n🎉 All tests passed! Check your email inbox.'));
    console.log(chalk.yellow('\n📬 You should receive 3 emails:'));
    console.log(chalk.white('   1. Contact form auto-response'));
    console.log(chalk.white('   2. Partner form auto-response'));
    console.log(chalk.white('   3. Funnel auto-response'));
    console.log(chalk.gray('\nEach email should contain:'));
    console.log(chalk.white('   ✓ Multilingual content (DE, FR, IT, EN)'));
    console.log(chalk.white('   ✓ Personalized greeting'));
    console.log(chalk.white('   ✓ Marco Circelli signature'));
  } else {
    console.log(chalk.red.bold('\n❌ Some tests failed. Check the logs above.'));
  }
  
  console.log(chalk.gray('\n━'.repeat(60)));
  console.log(chalk.white('\n💡 Troubleshooting:'));
  console.log(chalk.white('   • Ensure dev server is running: npm run dev'));
  console.log(chalk.white('   • Check .env file has email configuration'));
  console.log(chalk.white('   • Verify database connection for funnel test'));
  console.log(chalk.white('   • Check spam/junk folder for emails\n'));
};

// Check if chalk is available, otherwise use fallback
try {
  require.resolve('chalk');
  runAllTests();
} catch (e) {
  console.log('\n⚠️  Installing chalk for better output...\n');
  console.log('Or run: node test-contact-autoresponse.js (for individual tests)\n');
  
  // Fallback without chalk
  const noChalk = {
    blue: (t) => t,
    green: (t) => t,
    red: (t) => t,
    yellow: (t) => t,
    cyan: { bold: (t) => t },
    white: (t) => t,
    gray: (t) => t,
    green: { bold: (t) => t },
    red: { bold: (t) => t }
  };
  global.chalk = noChalk;
  runAllTests();
}
