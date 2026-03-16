
import { login, findContactByEmail, createContact, updateContact } from "@/components/salesforceApi";


/**
 * Store partner email in Salesforce Contact.Partner_Consultant__c (Contact lookup).
 * If a Contact with this email exists, update it. Otherwise, create a new Contact.
 * Sets Partner_Consultant__c to the Contact's own ID (self-link).
 */
export async function savePartnerConsultantEmailToSalesforce(email: string) {
  if (!email) return;
  await login();

  // 1. Find or create Contact for this email
  let contact = await findContactByEmail(email);
  if (!contact) {
    // Create minimal Contact
    const contactFields = {
      LastName: email.split("@")[0] || "Partner",
      FirstName: "Partner",
      Email: email
    };
    const contactResult = await createContact(contactFields); // SaveResult: { id, success, errors }
    if (!contactResult || !contactResult.id) throw new Error("Failed to create Contact for Partner Consultant");
    contact = { Id: contactResult.id };
  }

  // 2. Update the Contact's Partner_Consultant__c field to its own Id (self-link)
  // if (typeof contact.Id === 'string') {
  //   await updateContact(contact.Id, { Partner_Consultant__c: contact.Id });
  //   return { updated: true, id: contact.Id };
  // } else {
  //   throw new Error('Contact Id is missing or invalid');
  // }
}
