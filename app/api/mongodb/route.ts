import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = process.env.MONGODB_DB?.trim() || "astroai";

export async function GET() {
  try {
    const client = await clientPromise;

    await client.db(DB_NAME).command({ ping: 1 });

    console.log("✅ MONGODB: connection successful");

    return NextResponse.json({
      success: true,
      message: "MongoDB connection successful",
      database: DB_NAME,
    });
  } catch (error) {
    console.error("❌ MONGODB: connection failed", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
