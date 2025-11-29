import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.SHAREPOINT_CLIENT_ID!);
  params.append("client_secret", process.env.SHAREPOINT_CLIENT_SECRET!);
  params.append(
    "scope",
    "https://graph.microsoft.com/.default"
  );

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: params,
    }
  );

  const json = await res.json();

  if (!json.access_token) {
    console.error("Token error:", json);
    return NextResponse.json({ error: "Token Error" }, { status: 500 });
  }

  return NextResponse.json({ accessToken: json.access_token });
}
