import { NextRequest, NextResponse } from "next/server";
import { sendAstroEmail } from "@/lib/sendAstroEmail";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
) {
  try {
    const body: unknown =
      await req.json();

    if (
      !body ||
      typeof body !== "object"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        },
      );
    }

    const data =
      body as {
        profile?: {
          name?: unknown;
          dateOfBirth?: unknown;
          timeOfBirth?: unknown;
          placeOfBirth?: {
            name?: unknown;
            displayName?: unknown;
          } | null;
        };
        question?: unknown;
        answer?: unknown;
      };

    const profile =
      data.profile;

    if (
      !profile ||
      typeof profile.name !== "string" ||
      typeof profile.dateOfBirth !== "string" ||
      typeof profile.timeOfBirth !== "string" ||
      !profile.placeOfBirth ||
      typeof profile.placeOfBirth.name !==
        "string" ||
      typeof profile.placeOfBirth.displayName !==
        "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid birth profile.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof data.question !==
        "string" ||
      !data.question.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Question is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof data.answer !==
        "string" ||
      !data.answer.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Answer is required.",
        },
        {
          status: 400,
        },
      );
    }

    await sendAstroEmail({
      profile: {
        name: profile.name,
        dateOfBirth:
          profile.dateOfBirth,
        timeOfBirth:
          profile.timeOfBirth,
        placeOfBirth: {
          name:
            profile.placeOfBirth.name,
          displayName:
            profile.placeOfBirth.displayName,
        },
      },

      question:
        data.question.trim(),

      answer:
        data.answer.trim(),
    });

    return NextResponse.json({
      success: true,
      message:
        "AstroAI email sent successfully.",
    });
  } catch (error) {
    console.error(
      "Email API error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send email.",
      },
      {
        status: 500,
      },
    );
  }
}