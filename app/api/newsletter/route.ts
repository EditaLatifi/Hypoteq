import { NextResponse } from "next/server";
import "dotenv/config";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    const apiKey = process.env.MAILCHIMP_API_KEY;
    const listId = process.env.MAILCHIMP_AUDIENCE_ID;

    if (!apiKey || !listId) {
      console.error("❌ Mailchimp credentials missing");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Extract datacenter from API key (e.g., us7 from key-us7)
    const datacenter = apiKey.split("-")[1];

    // Subscribe to Mailchimp
    const response = await fetch(
      `https://${datacenter}.api.mailchimp.com/3.0/lists/${listId}/members`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: email,
          status: "subscribed",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Handle already subscribed
      if (data.title === "Member Exists") {
        return NextResponse.json(
          { success: true, message: "Email already subscribed" },
          { status: 200 }
        );
      }

      console.error("❌ Mailchimp error:", data);
      return NextResponse.json(
        { success: false, error: data.detail || "Failed to subscribe" },
        { status: 400 }
      );
    }

    console.log("✅ Successfully subscribed:", email);
    return NextResponse.json(
      { success: true, message: "Successfully subscribed" },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Newsletter subscription error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
