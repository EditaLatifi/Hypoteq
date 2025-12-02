// Test Contact Form Email
// Run with: node test-contact.js

const testContactForm = async () => {
  const testData = {
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test AG",
    email: "max@example.com",
    phone: "+41 44 123 45 67",
    inquiryType: "financing",
    message: "Dies ist eine Test-Nachricht vom Kontaktformular."
  };

  console.log("🧪 Testing contact form...");
  console.log("📝 Test data:", testData);

  try {
    const response = await fetch("http://localhost:3001/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    const data = await response.json();
    
    console.log("\n📬 Response status:", response.status);
    console.log("📬 Response data:", data);

    if (data.success) {
      console.log("\n✅ SUCCESS! Email sent successfully!");
      console.log("Check info@hypoteq.ch inbox for the test email.");
    } else {
      console.log("\n❌ FAILED:", data.error);
      console.log("\nTroubleshooting:");
      console.log("1. Check if dev server is running (npm run dev)");
      console.log("2. Check SMTP credentials in .env file");
      console.log("3. Consider using Resend (see CONTACT_FORM_FIX.md)");
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("\nMake sure your dev server is running:");
    console.log("npm run dev");
  }
};

testContactForm();
