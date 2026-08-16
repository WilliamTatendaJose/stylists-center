import { useState } from 'react';
import type { AdminReviewRowDto } from '@sc/shared';
import { useDeleteReview, useReviews } from '../api/reviews';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';

function ReviewRow({ review }: { review: AdminReviewRowDto }) {
  const deleteReview = useDeleteReview();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (!window.confirm('Delete this review? This recalculates the provider’s rating.')) return;
    setError(null);
    deleteReview.mutate(review.id, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'Could not delete.');
      },
    });
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900 dark:text-dark-text">
          {review.rating}★ · {review.rater.displayName} → {review.ratee.displayName}
        </p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
          {review.bookingReference} · {new Date(review.createdAt).toLocaleDateString()}
        </p>
        {review.text ? (
          <p className="mt-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-white/5 dark:text-dark-muted">
            {review.text}
          </p>
        ) : null}
        {error ? (
          <p className="mt-1 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
        ) : null}
      </div>
      <Button variant="danger" onClick={remove} disabled={deleteReview.isPending}>
        Delete
      </Button>
    </div>
  );
}

export function ReviewsPage() {
  const { data: reviews, isLoading, isError } = useReviews();

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-neutral-900 dark:text-dark-text">Reviews</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        Most recent reviews across the platform. Deleting one recomputes the provider&apos;s average
        rating.
      </p>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load reviews.</p>
      ) : null}
      {!isLoading && reviews?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">No reviews yet.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {reviews?.map((r) => (
          <ReviewRow key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}
