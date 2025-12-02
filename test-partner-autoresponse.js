/**
 * Test script for Partner Form Auto-Response
 * This will test if the auto-response email is sent when someone submits the partner form
 */

const testPartnerForm = async () => {
  console.log('🧪 Testing Partner Form Auto-Response...\n');

  const testData = {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'partner@example.com', // Change this to your email to receive the test
    phone: '+41 79 987 65 43',
    message: 'I am interested in becoming a partner with HYPOTEQ. This is a test message.'
  };

  try {
    const response = await fetch('http://localhost:3000/api/partner-contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    console.log('📬 Response Status:', response.status);
    console.log('📋 Response Data:', result);
    
    if (response.ok && result.success) {
      console.log('\n✅ SUCCESS! Partner form submitted successfully.');
      console.log('📧 Check the email inbox for:', testData.email);
      console.log('\n📝 Expected Auto-Response:');
      console.log('   Subject: Vielen Dank für dein Interesse an einer Partnerschaft · Merci pour ton intérêt pour un partenariat · Grazie per il tuo interesse · Thank you for your interest in a partnership');
      console.log('   Content: Multilingual partnership confirmation in DE, FR, IT, EN');
      console.log('   Signature: Marco Circelli contact details');
    } else {
      console.log('\n❌ FAILED! Error:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Development server is running (npm run dev)');
    console.log('   2. Email service is configured (.env file)');
    console.log('   3. Server is accessible at http://localhost:3000');
  }
};

// Run the test
testPartnerForm();
