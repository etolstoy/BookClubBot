import { useState, useContext } from "react";
import { Link } from "react-router-dom";
import type { Review } from "../api/client";
import { getCurrentUserId, isCurrentUserAdmin } from "../api/client";
import { ConfigContext } from "../App";
import SentimentBadge from "./SentimentBadge";
import EditReviewModal from "./EditReviewModal";
import { useTranslation } from "../i18n/index.js";

interface ReviewCardProps {
  review: Review;
  showBook?: boolean;
  onReviewUpdated?: (updatedReview: Review) => void;
  onReviewDeleted?: () => void;
}

export default function ReviewCard({
  review,
  showBook = false,
  onReviewUpdated,
  onReviewDeleted,
}: ReviewCardProps) {
  const { t } = useTranslation();
  const config = useContext(ConfigContext);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentReview, setCurrentReview] = useState(review);

  const currentUserId = getCurrentUserId();
  const isOwner = currentUserId === currentReview.telegramUserId;
  const isAdmin = config ? isCurrentUserAdmin(config.adminUserIds) : false;
  const canEdit = isOwner || isAdmin;

  const formattedDate = new Date(currentReview.reviewedAt).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );

  const handleReviewUpdated = (updatedReview: Review) => {
    setCurrentReview(updatedReview);
    if (onReviewUpdated) {
      onReviewUpdated(updatedReview);
    }
  };

  return (
    <>
      <div className="p-4 rounded-lg bg-tg-secondary">
        <div className="flex items-start justify-between mb-2">
          <Link
            to={`/reviewer/${currentReview.telegramUserId}`}
            className="font-medium text-tg-text no-underline"
          >
            {currentReview.reviewerName}
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentReview.sentiment && (
              <SentimentBadge sentiment={currentReview.sentiment} />
            )}
            <span className="text-xs text-tg-hint">{formattedDate}</span>
            {canEdit && (
              <button
                onClick={() => setShowEditModal(true)}
                className="ml-2 text-xs text-tg-text no-underline"
                title={t("review.edit")}
              >
                ✏️ {t("review.edit")}
              </button>
            )}
          </div>
        </div>

        {showBook && currentReview.book && (
          <Link
            to={`/book/${currentReview.book.id}`}
            className="flex items-start gap-2 mb-2 text-sm no-underline"
          >
            {currentReview.book.coverUrl && (
              <img
                src={currentReview.book.coverUrl}
                alt={currentReview.book.title}
                className="w-8 h-12 object-cover rounded"
              />
            )}
            <div className="flex flex-col">
              <span className="text-tg-text font-medium">
                {currentReview.book.title}
              </span>
              {currentReview.book.author && (
                <span className="text-tg-hint text-xs">
                  {currentReview.book.author}
                </span>
              )}
            </div>
          </Link>
        )}

        <p className="text-sm text-tg-text whitespace-pre-wrap">
          {currentReview.reviewText}
        </p>
      </div>

      {showEditModal && (
        <EditReviewModal
          review={currentReview}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleReviewUpdated}
          onDelete={onReviewDeleted}
        />
      )}
    </>
  );
}
