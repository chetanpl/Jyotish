import { NextRequest, NextResponse } from "next/server";
import { find } from "geo-tz";

export async function POST(req: NextRequest) {
  try {
    const { latitude, longitude } = await req.json();

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    const timezones = find(latitude, longitude);

    if (!timezones || timezones.length === 0) {
      return NextResponse.json(
        { error: "Timezone not found" },
        { status: 404 }
      );
    }

    const timezoneId = timezones[0];

    return NextResponse.json({
      timezoneId,
    });
  } catch (error) {
    console.error("Timezone error:", error);

    return NextResponse.json(
      { error: "Unable to determine timezone" },
      { status: 500 }
    );
  }
}