import { SFFieldType } from "./salesforceFieldConfig";

export const SALESFORCE_ACCOUNT_FIELDS: Record<string, SFFieldType> = {
  Steueroptimierung__c: "boolean",
  Zivilstand__c: "picklist",
  Erwerbsstatus__c: "picklist",
  PersonBirthdate: "date",
  PersonEmail: "string",
  Phone: "string",
  FirstName: "string",
  LastName: "string",
};
