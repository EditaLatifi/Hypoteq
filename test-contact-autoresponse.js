/**
 * Test script for Contact Form Auto-Response
 * This will test if the auto-response email is sent when someone submits the contact form
 */

const testContactForm = async () => {
  console.log('🧪 Testing Contact Form Auto-Response...\n');

  const testData = {
    firstName: 'John',
    lastName: 'Doe',
    company: 'Test Company',
    email: 'test@example.com', // Change this to your email to receive the test
    phone: '+41 79 123 45 67',
    inquiryType: 'general',
    message: 'This is a test message to verify auto-response functionality.'
  };

  try {
    const response = await fetch('http://localhost:3000/api/contact', {
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
      console.log('\n✅ SUCCESS! Contact form submitted successfully.');
      console.log('📧 Check the email inbox for:', testData.email);
      console.log('\n📝 Expected Auto-Response:');
      console.log('   Subject: Vielen Dank für deine Anfrage bei HYPOTEQ · Merci pour ta demande · Grazie per la tua richiesta · Thank you for your message');
      console.log('   Content: Multilingual thank you message in DE, FR, IT, EN');
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
testContactForm();
