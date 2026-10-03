import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME =
  process.env.MONGODB_DB?.trim() || "astroai";

const COLLECTION_NAME = "feedback";

/**
 * POST /api/feedback
 *
 * Saves feedback for an AstroAI answer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      sessionId,
      messageId,
      question,
      answer,
      profile,
      helpful,
      rating,
      improvements,
      comment,
    } = body;

    // Basic validation
    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: "sessionId is required",
        },
        { status: 400 },
      );
    }

    if (!messageId) {
      return NextResponse.json(
        {
          success: false,
          error: "messageId is required",
        },
        { status: 400 },
      );
    }

    if (
      helpful !== undefined &&
      typeof helpful !== "boolean"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "helpful must be a boolean",
        },
        { status: 400 },
      );
    }

    if (
      rating !== undefined &&
      rating !== null &&
      (!Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "rating must be an integer between 1 and 5",
        },
        { status: 400 },
      );
    }

    const client = await clientPromise;

    const db = client.db(DB_NAME);

    const feedback = {
      sessionId: String(sessionId),
      messageId: String(messageId),

      question:
        typeof question === "string"
          ? question.trim()
          : "",

      answer:
        typeof answer === "string"
          ? answer.trim()
          : "",

      profile:
        profile && typeof profile === "object"
          ? {
              name:
                typeof profile.name === "string"
                  ? profile.name
                  : "",
              dateOfBirth:
                typeof profile.dateOfBirth === "string"
                  ? profile.dateOfBirth
                  : "",
              timeOfBirth:
                typeof profile.timeOfBirth === "string"
                  ? profile.timeOfBirth
                  : "",
              placeOfBirth:
                profile.placeOfBirth &&
                typeof profile.placeOfBirth ===
                  "object"
                  ? {
                      name:
                        typeof profile.placeOfBirth
                          .name === "string"
                          ? profile.placeOfBirth.name
                          : "",
                      displayName:
                        typeof profile.placeOfBirth
                          .displayName === "string"
                          ? profile.placeOfBirth
                              .displayName
                          : "",
                    }
                  : null,
            }
          : null,

      helpful:
        typeof helpful === "boolean"
          ? helpful
          : null,

      rating:
        Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= 5
          ? rating
          : null,

      improvements:
        Array.isArray(improvements)
          ? improvements
              .filter(
                (item): item is string =>
                  typeof item === "string",
              )
              .map((item) => item.trim())
              .filter(Boolean)
          : [],

      comment:
        typeof comment === "string"
          ? comment.trim()
          : "",

      reply: null,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db
      .collection(COLLECTION_NAME)
      .insertOne(feedback);

    console.log(
      "✅ FEEDBACK SAVED:",
      result.insertedId.toString(),
    );

    return NextResponse.json(
      {
        success: true,
        message: "Feedback saved successfully",
        feedbackId: result.insertedId.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "❌ FEEDBACK POST ERROR:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/feedback
 *
 * Examples:
 *
 * /api/feedback
 * /api/feedback?sessionId=abc
 * /api/feedback?messageId=xyz
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } =
      new URL(request.url);

    const sessionId =
      searchParams.get("sessionId");

    const messageId =
      searchParams.get("messageId");

    const limitParam =
      searchParams.get("limit");

    const requestedLimit = Number(limitParam);

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 50;

    const filter: Record<string, string> = {};

    if (sessionId) {
      filter.sessionId = sessionId;
    }

    if (messageId) {
      filter.messageId = messageId;
    }

    const client = await clientPromise;

    const db = client.db(DB_NAME);

    const feedback = await db
      .collection(COLLECTION_NAME)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      count: feedback.length,
      feedback,
    });
  } catch (error) {
    console.error(
      "❌ FEEDBACK GET ERROR:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}