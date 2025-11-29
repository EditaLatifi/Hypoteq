import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    DRIVE_ID: process.env.DRIVE_ID,
    FOLDER_ID: process.env.FOLDER_ID,
    ALL_ENV: Object.keys(process.env),
  });
}
