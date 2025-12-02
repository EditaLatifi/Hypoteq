/**
 * Test script for Funnel (Mortgage Inquiry) Auto-Response
 * This will test if the auto-response email is sent when someone submits the mortgage funnel
 */

const testFunnelForm = async () => {
  console.log('🧪 Testing Funnel Auto-Response...\n');

  const testData = {
    customerType: 'direct',
    client: {
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'funnel@example.com', // Change this to your email to receive the test
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
      finanzierungsangebote: 'ja',
      angeboteListe: ['Bank A | 1.5% | 10 Jahre'],
      kreditnehmer: [
        {
          vorname: 'Max',
          name: 'Mustermann',
          geburtsdatum: '1990-01-01',
          erwerb: 'angestellt',
          status: 'ledig'
        }
      ]
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
    const response = await fetch('http://localhost:3000/api/inquiry', {
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
      console.log('\n✅ SUCCESS! Funnel form submitted successfully.');
      console.log('📧 Check the email inbox for:', testData.client.email);
      console.log('\n📝 Expected Auto-Response:');
      console.log('   Subject: Deine Hypothekaranfrage ist eingegangen · Ta demande d\'hypothèque a été reçue · La tua richiesta ipotecaria è stata ricevuta · Your mortgage request has been received');
      console.log('   Content: Multilingual mortgage confirmation in DE, FR, IT, EN');
      console.log('   Signature: Marco Circelli contact details');
    } else {
      console.log('\n❌ FAILED! Error:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Development server is running (npm run dev)');
    console.log('   2. Email service is configured (.env file)');
    console.log('   3. Database is configured and accessible');
    console.log('   4. Server is accessible at http://localhost:3000');
  }
};

// Run the test
testFunnelForm();
