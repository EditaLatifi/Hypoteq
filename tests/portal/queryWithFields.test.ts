/**
 * Salesforce names a missing column without its relationship («No such column 'Name'»), so
 * the same name can stand for two fields of the select (`Name` and `Account.Name`). The
 * query used to give up on the second error instead of dropping the second field.
 */

import { describe, it, expect, jest } from "@jest/globals";

const queries: string[] = [];
const mockQuery = jest.fn<any>();

jest.mock("@/components/salesforceApi", () => ({
  conn: { accessToken: "token", query: (soql: string) => mockQuery(soql) },
  login: async () => {},
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { findContactByEmail } from "@/lib/portal/salesforce";

const noSuchColumn = (col: string) =>
  Object.assign(new Error(`No such column '${col}' on entity 'Contact'.`), { errorCode: "INVALID_FIELD" });

describe("queryWithFields", () => {
  it("drops every field a missing column name stands for, one per attempt", async () => {
    mockQuery.mockImplementation(async (soql: string) => {
      queries.push(soql);
      if (queries.length <= 2) throw noSuchColumn("Name");
      return { records: [{ Id: "003000000000001AAA", Email: "anna@firma.ch" }] };
    });

    const contact = await findContactByEmail("anna@firma.ch");

    expect(contact?.Id).toBe("003000000000001AAA");
    const selectOf = (soql: string) => soql.replace(/^SELECT (.*?) FROM .*$/, "$1").split(", ");
    expect(queries).toHaveLength(3);
    expect(selectOf(queries[1])).not.toContain("Name");
    expect(selectOf(queries[1])).toContain("Account.Name");
    expect(selectOf(queries[2])).not.toContain("Account.Name");
  });
});
