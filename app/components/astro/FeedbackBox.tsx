"use client";

import { useState } from "react";

type FeedbackBoxProps = {
  sessionId: string;
  messageId: string;
  question: string;
  answer: string;
  profile?: {
    name?: string;
    dateOfBirth?: string;
    timeOfBirth?: string;
    placeOfBirth?: {
      name?: string;
      displayName?: string;
    } | null;
  } | null;
};

const improvementOptions = [
  "More specific",
  "More detailed",
  "Better explanation",
  "Better timing",
  "Easier to understand",
  "Other",
];

export default function FeedbackBox({
  sessionId,
  messageId,
  question,
  answer,
  profile,
}: FeedbackBoxProps) {
  const [helpful, setHelpful] = useState<boolean | null>(
    null,
  );

  const [rating, setRating] = useState<number | null>(
    null,
  );

  const [improvements, setImprovements] = useState<
    string[]
  >([]);

  const [comment, setComment] = useState("");

  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleImprovement(value: string) {
    setImprovements((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function handleSubmit() {
    if (
      helpful === null &&
      rating === null &&
      improvements.length === 0 &&
      !comment.trim()
    ) {
      setError("Please give at least one piece of feedback.");
      return;
    }

    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          messageId,
          question,
          answer,
          profile,
          helpful,
          rating,
          improvements,
          comment: comment.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to save feedback.",
        );
      }

      setSubmitted(true);
    } catch (error) {
      console.error("❌ FEEDBACK SUBMIT ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to save feedback.",
      );
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <div className="astro-feedback astro-feedback-success">
        <div className="astro-feedback-success-icon">
          ✓
        </div>

        <div>
          <div className="astro-feedback-success-title">
            Thank you for your feedback
          </div>

          <div className="astro-feedback-success-text">
            Your feedback helps us improve AstroAI.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="astro-feedback">
      <div className="astro-feedback-header">
        <div>
          <h4 className="astro-feedback-title">
            How was this answer?
          </h4>

          <p className="astro-feedback-subtitle">
            Your feedback helps us make AstroAI more useful.
          </p>
        </div>
      </div>

      <div className="astro-feedback-reaction-row">
        <button
          type="button"
          className={`astro-feedback-reaction ${
            helpful === true
              ? "astro-feedback-reaction-active"
              : ""
          }`}
          onClick={() => setHelpful(true)}
          aria-label="Helpful"
        >
          <span className="astro-feedback-reaction-icon">
            👍
          </span>
          Helpful
        </button>

        <button
          type="button"
          className={`astro-feedback-reaction ${
            helpful === false
              ? "astro-feedback-reaction-active"
              : ""
          }`}
          onClick={() => setHelpful(false)}
          aria-label="Not helpful"
        >
          <span className="astro-feedback-reaction-icon">
            👎
          </span>
          Not helpful
        </button>
      </div>

      <div className="astro-feedback-section">
        <div className="astro-feedback-label">
          Rate this answer
        </div>

        <div className="astro-feedback-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`astro-feedback-star ${
                rating !== null && star <= rating
                  ? "astro-feedback-star-active"
                  : ""
              }`}
              onClick={() => setRating(star)}
              aria-label={`${star} star${
                star > 1 ? "s" : ""
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="astro-feedback-section">
        <div className="astro-feedback-label">
          What could be improved?
        </div>

        <div className="astro-feedback-chips">
          {improvementOptions.map((option) => {
            const selected =
              improvements.includes(option);

            return (
              <button
                key={option}
                type="button"
                className={`astro-feedback-chip ${
                  selected
                    ? "astro-feedback-chip-active"
                    : ""
                }`}
                onClick={() =>
                  toggleImprovement(option)
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="astro-feedback-section">
        <label
          htmlFor={`feedback-${messageId}`}
          className="astro-feedback-label"
        >
          Tell us more
        </label>

        <textarea
          id={`feedback-${messageId}`}
          value={comment}
          onChange={(event) =>
            setComment(event.target.value)
          }
          placeholder="What would make this answer better?"
          rows={3}
          maxLength={1000}
          className="astro-feedback-textarea"
        />

        <div className="astro-feedback-character-count">
          {comment.length}/1000
        </div>
      </div>

      {error && (
        <div className="astro-feedback-error">
          {error}
        </div>
      )}

      <div className="astro-feedback-footer">
        <button
          type="button"
          className="astro-feedback-submit"
          onClick={() => void handleSubmit()}
          disabled={sending}
        >
          {sending ? "Sending..." : "Send Feedback"}
        </button>
      </div>
    </div>
  );
}
