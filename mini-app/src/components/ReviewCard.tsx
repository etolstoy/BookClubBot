import { useState, useContext } from "react";
import { Link } from "react-router-dom";
import type { Review } from "../api/client";
import { getCurrentUserId, isCurrentUserAdmin } from "../api/client";
import { ConfigContext } from "../App";
import SentimentBadge from "./SentimentBadge";
import MissingFieldsBadge from "./MissingFieldsBadge";
import EditReviewModal from "./EditReviewModal";
import { useTranslation } from "../i18n/index.js";
import { getReviewDeepLink, copyToClipboard, showHapticFeedback } from "../lib/deepLinks.js";
import { useToast } from "../hooks/useToast.js";
import { stopPropagationIf, withStopPropagation } from "../lib/eventUtils";
import Toast from "./Toast.js";

interface ReviewCardProps {
  review: Review;
  showBook?: boolean;
  showShareButton?: boolean;
  truncate?: boolean;
  onReviewUpdated?: (updatedReview: Review) => void;
  onReviewDeleted?: () => void;
  missingFields?: string[];
  onEdit?: () => void;
}

export default function ReviewCard({
  review,
  showBook = false,
  showShareButton = true,
  truncate = false,
  onReviewUpdated,
  onReviewDeleted,
  missingFields,
  onEdit,
}: ReviewCardProps) {
  const { t } = useTranslation();
  const config = useContext(ConfigContext);
  const { message, showToast } = useToast();
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

  const handleCopyLink = async () => {
    if (!config?.botUsername) return;

    try {
      const url = getReviewDeepLink(config.botUsername, currentReview.id);
      await copyToClipboard(url);
      showHapticFeedback();
      showToast(t("common.linkCopied"));
    } catch (error) {
      console.error("Failed to copy link:", error);
      showToast("Ошибка копирования");
    }
  };

  return (
    <>
      <div
        className={`p-4 rounded-lg bg-tg-secondary ${onEdit ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        onClick={onEdit}
      >
        <div className="flex items-start justify-between mb-2">
          <Link
            to={`/reviewer/${currentReview.telegramUserId}`}
            className="font-medium text-tg-text no-underline"
            onClick={stopPropagationIf(!!onEdit)}
          >
            {currentReview.reviewerName}
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentReview.sentiment && (
              <SentimentBadge sentiment={currentReview.sentiment} />
            )}
            <Link
              to={`/review/${currentReview.id}`}
              className="text-xs text-tg-hint no-underline hover:opacity-70"
              onClick={stopPropagationIf(!!onEdit)}
            >
              {formattedDate}
            </Link>
            {canEdit && (
              <button
                onClick={withStopPropagation(() => setShowEditModal(true), !!onEdit)}
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
            onClick={stopPropagationIf(!!onEdit)}
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

        <p
          className="text-sm text-tg-text whitespace-pre-wrap break-words"
          style={truncate ? {
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          } : undefined}
        >
          {currentReview.reviewText}
        </p>

        <MissingFieldsBadge
          fields={missingFields}
          labels={{ book: "Книга" }}
        />

        {showShareButton && config?.botUsername && (
          <button
            onClick={withStopPropagation(handleCopyLink, !!onEdit)}
            className="mt-3 text-xs text-tg-hint hover:text-tg-text transition-colors"
          >
            🔗 {t("common.copyLink")}
          </button>
        )}
      </div>

      {message && <Toast message={message} />}

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
