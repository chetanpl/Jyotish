"use client";

import { useState } from "react";

import type { UiText } from "@/lib/astro-ui";

type ImprovementKey =
    | "specific"
    | "detailed"
    | "explanation"
    | "timing"
    | "easier"
    | "other";

type FeedbackBoxProps = {
    t: UiText;
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

const improvementOptions: ImprovementKey[] = [
    "specific",
    "detailed",
    "explanation",
    "timing",
    "easier",
    "other",
];

type FeedbackResponse = {
    success?: boolean;
    error?: string;
};

export default function FeedbackBox({
    t,
    sessionId,
    messageId,
    question,
    answer,
    profile,
}: FeedbackBoxProps) {
    const [helpful, setHelpful] = useState<boolean | null>(null);
    const [rating, setRating] = useState<number | null>(null);
    const [improvements, setImprovements] = useState<ImprovementKey[]>([]);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    function handleHelpfulChange(value: boolean): void {
        setHelpful(value);
        setError("");
    }

    function handleRatingChange(value: number): void {
        setRating(value);
        setError("");
    }

    function toggleImprovement(value: ImprovementKey): void {
        setImprovements((current) =>
            current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value],
        );

        setError("");
    }

    async function handleSubmit(): Promise<void> {
        if (sending || submitted) {
            return;
        }

        if (helpful === null) {
            setError(t.feedback.validationHelpful);
            return;
        }

        if (rating === null) {
            setError(t.feedback.validationRating);
            return;
        }

        const trimmedComment = comment.trim();

        if (!trimmedComment) {
            setError(t.feedback.validationMessage);
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
                    comment: trimmedComment,
                }),
            });

            let data: FeedbackResponse;

            try {
                data = (await response.json()) as FeedbackResponse;
            } catch {
                throw new Error(t.feedback.saveError);
            }

            if (!response.ok || data.success !== true) {
                throw new Error(data.error || t.feedback.saveError);
            }

            setSubmitted(true);
        } catch (submitError: unknown) {
            console.error("Feedback submission failed:", submitError);

            setError(
                submitError instanceof Error
                    ? submitError.message
                    : t.feedback.saveError,
            );
        } finally {
            setSending(false);
        }
    }

    if (submitted) {
        return (
            <div className="astro-feedback astro-feedback-success">
                <div className="astro-feedback-success-icon" aria-hidden="true">
                    ✓
                </div>

                <div>
                    <div className="astro-feedback-success-title">
                        {t.feedback.successTitle}
                    </div>

                    <div className="astro-feedback-success-text">
                        {t.feedback.successMessage}
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
                        {t.feedback.title}
                    </h4>

                    <p className="astro-feedback-subtitle">
                        {t.feedback.subtitle}
                    </p>
                </div>
            </div>

            {/* Helpful / Not helpful */}
            <div className="astro-feedback-reaction-row">
                <button
                    type="button"
                    className={`astro-feedback-reaction ${
                        helpful === true
                            ? "astro-feedback-reaction-active"
                            : ""
                    }`}
                    onClick={() => handleHelpfulChange(true)}
                    aria-label={t.feedback.helpful}
                    aria-pressed={helpful === true}
                    disabled={sending}
                >
                    <span
                        className="astro-feedback-reaction-icon"
                        aria-hidden="true"
                    >
                        👍
                    </span>

                    {t.feedback.helpful}
                </button>

                <button
                    type="button"
                    className={`astro-feedback-reaction ${
                        helpful === false
                            ? "astro-feedback-reaction-active"
                            : ""
                    }`}
                    onClick={() => handleHelpfulChange(false)}
                    aria-label={t.feedback.notHelpful}
                    aria-pressed={helpful === false}
                    disabled={sending}
                >
                    <span
                        className="astro-feedback-reaction-icon"
                        aria-hidden="true"
                    >
                        👎
                    </span>

                    {t.feedback.notHelpful}
                </button>
            </div>

            {/* Rating */}
            <div className="astro-feedback-section">
                <div className="astro-feedback-label">
                    {t.feedback.ratingLabel}
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
                            onClick={() => handleRatingChange(star)}
                            aria-label={`${star} ${
                                star === 1 ? "star" : "stars"
                            }`}
                            aria-pressed={rating === star}
                            disabled={sending}
                        >
                            ★
                        </button>
                    ))}
                </div>
            </div>

            {/* Optional improvements */}
            <div className="astro-feedback-section">
                <div className="astro-feedback-label">
                    {t.feedback.improvementLabel}
                </div>

                <div className="astro-feedback-chips">
                    {improvementOptions.map((option) => {
                        const selected = improvements.includes(option);

                        return (
                            <button
                                key={option}
                                type="button"
                                className={`astro-feedback-chip ${
                                    selected
                                        ? "astro-feedback-chip-active"
                                        : ""
                                }`}
                                onClick={() => toggleImprovement(option)}
                                aria-pressed={selected}
                                disabled={sending}
                            >
                                {t.feedback.improvements[option]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Required message */}
            <div className="astro-feedback-section">
                <label
                    htmlFor={`feedback-${messageId}`}
                    className="astro-feedback-label"
                >
                    {t.feedback.messageLabel}
                </label>

                <textarea
                    id={`feedback-${messageId}`}
                    value={comment}
                    onChange={(event) => {
                        setComment(event.target.value);
                        setError("");
                    }}
                    placeholder={t.feedback.messagePlaceholder}
                    rows={3}
                    maxLength={1000}
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                        error ? "astro-feedback-error" : undefined
                    }
                    className="astro-feedback-textarea"
                    disabled={sending}
                />

                <div className="astro-feedback-character-count">
                    {comment.length}/1000
                </div>
            </div>

            {/* Validation / submission error */}
            {error && (
                <div
                    id="astro-feedback-error"
                    className="astro-feedback-error"
                    role="alert"
                >
                    {error}
                </div>
            )}

            {/* Submit */}
            <div className="astro-feedback-footer">
                <button
                    type="button"
                    className="astro-feedback-submit"
                    onClick={() => void handleSubmit()}
                    disabled={sending}
                >
                    {sending
                        ? t.feedback.sending
                        : t.feedback.send}
                </button>
            </div>
        </div>
    );
}