import { useState } from "react";
import { updateBook, deleteBook, searchGoogleBooks, type BookDetail, type UpdateBookInput } from "../api/client";

interface EditBookModalProps {
  book: BookDetail;
  onClose: () => void;
  onSuccess: (updatedBook: BookDetail) => void;
  onDelete?: () => void;
}

export default function EditBookModal({
  book,
  onClose,
  onSuccess,
  onDelete,
}: EditBookModalProps) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || "");
  const [isbn, setIsbn] = useState(book.isbn || "");
  const [coverUrl, setCoverUrl] = useState(book.coverUrl || "");
  const [description, setDescription] = useState(book.description || "");
  const [publicationYear, setPublicationYear] = useState(book.publicationYear?.toString() || "");
  const [pageCount, setPageCount] = useState(book.pageCount?.toString() || "");
  const [goodreadsUrl, setGoodreadsUrl] = useState(book.goodreadsUrl || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSyncIsbn = async () => {
    if (!isbn.trim()) {
      setError("Please enter an ISBN first");
      return;
    }

    setSyncing(true);
    setError(null);
    setSyncSuccess(false);

    try {
      const result = await searchGoogleBooks(isbn.trim());

      if (result.books.length === 0) {
        setError("No book found with this ISBN");
        return;
      }

      const googleBook = result.books[0];

      // Populate form fields with Google Books data
      if (googleBook.title) setTitle(googleBook.title);
      if (googleBook.author) setAuthor(googleBook.author);
      if (googleBook.coverUrl) setCoverUrl(googleBook.coverUrl);
      if (googleBook.description) setDescription(googleBook.description);
      if (googleBook.publicationYear) setPublicationYear(googleBook.publicationYear.toString());
      if (googleBook.pageCount) setPageCount(googleBook.pageCount.toString());

      setSyncSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync with Google Books");
    } finally {
      setSyncing(false);
    }
  };

  const hasChanges = () => {
    return (
      title !== book.title ||
      author !== (book.author || "") ||
      isbn !== (book.isbn || "") ||
      coverUrl !== (book.coverUrl || "") ||
      description !== (book.description || "") ||
      publicationYear !== (book.publicationYear?.toString() || "") ||
      pageCount !== (book.pageCount?.toString() || "") ||
      goodreadsUrl !== (book.goodreadsUrl || "")
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title cannot be empty");
      return;
    }

    if (!hasChanges()) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData: UpdateBookInput = {};

      // Debug logging
      console.log('[EditBookModal] Current state:', { title, author, isbn, description, publicationYear, pageCount });
      console.log('[EditBookModal] Original book:', { title: book.title, author: book.author, isbn: book.isbn, description: book.description, publicationYear: book.publicationYear, pageCount: book.pageCount });

      if (title !== book.title) {
        console.log('[EditBookModal] Title changed');
        updateData.title = title.trim();
      }

      if (author !== (book.author || "")) {
        console.log('[EditBookModal] Author comparison:', { author, bookAuthor: book.author, different: true });
        // Don't accidentally clear a non-empty value with an empty string
        if (book.author && author.trim() === "") {
          console.log('[EditBookModal] Skipping author clear (safety check)');
          // Skip: likely unintentional clearing
        } else {
          console.log('[EditBookModal] Adding author to update');
          updateData.author = author.trim() || null;
        }
      }

      if (isbn !== (book.isbn || "")) {
        console.log('[EditBookModal] ISBN comparison:', { isbn, bookIsbn: book.isbn, different: true });
        // Don't accidentally clear a non-empty value with an empty string
        if (book.isbn && isbn.trim() === "") {
          console.log('[EditBookModal] Skipping ISBN clear (safety check)');
          // Skip: likely unintentional clearing
        } else {
          console.log('[EditBookModal] Adding ISBN to update');
          updateData.isbn = isbn.trim() || null;
        }
      }

      if (coverUrl !== (book.coverUrl || "")) {
        updateData.coverUrl = coverUrl.trim() || null;
      }

      if (goodreadsUrl !== (book.goodreadsUrl || "")) {
        updateData.goodreadsUrl = goodreadsUrl.trim() || null;
      }

      if (description !== (book.description || "")) {
        updateData.description = description.trim() || null;
      }

      const parsedPublicationYear = publicationYear ? parseInt(publicationYear, 10) : null;
      if (parsedPublicationYear !== book.publicationYear) {
        updateData.publicationYear = parsedPublicationYear;
      }

      const parsedPageCount = pageCount ? parseInt(pageCount, 10) : null;
      if (parsedPageCount !== book.pageCount) {
        updateData.pageCount = parsedPageCount;
      }

      console.log('[EditBookModal] Final updateData:', updateData);

      const result = await updateBook(book.id, updateData);
      console.log('[EditBookModal] Server response:', result);

      // Show success message from backend
      const tg = window.Telegram?.WebApp as any;
      if (tg?.showAlert) {
        tg.showAlert(result.message);
      }

      onSuccess(result.book);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update book");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const tg = window.Telegram?.WebApp as any;

    const confirmMessage = `⚠️ Delete Book and All Reviews?\n\nThis will permanently delete the book "${book.title}" and all ${book.reviewCount} associated review(s). This action cannot be undone.`;

    // Show confirmation dialog
    if (tg?.showConfirm) {
      tg.showConfirm(confirmMessage, async (confirmed: boolean) => {
        if (!confirmed) return;

        setDeleting(true);
        setError(null);

        try {
          const result = await deleteBook(book.id);

          // Show success message
          if (tg?.showAlert) {
            tg.showAlert(result.message);
          }

          // Call onDelete callback and close modal
          if (onDelete) {
            onDelete();
          }
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete book");
        } finally {
          setDeleting(false);
        }
      });
    } else {
      // Fallback for non-Telegram environment
      if (window.confirm(confirmMessage)) {
        setDeleting(true);
        setError(null);

        try {
          const result = await deleteBook(book.id);
          alert(result.message);

          if (onDelete) {
            onDelete();
          }
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete book");
        } finally {
          setDeleting(false);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-tg-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-tg-secondary sticky top-0 bg-tg-bg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-tg-text">Edit Book</h2>
            <button
              onClick={onClose}
              className="text-tg-hint hover:text-tg-text"
              disabled={saving || deleting}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500 bg-opacity-20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter book title"
              disabled={saving || deleting}
            />
          </div>

          {/* Author */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter author name"
              disabled={saving || deleting}
            />
          </div>

          {/* ISBN */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              ISBN
            </label>
            <input
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter ISBN (e.g., 9781234567890)"
              disabled={saving || deleting || syncing}
            />
            <button
              onClick={handleSyncIsbn}
              disabled={saving || deleting || syncing || !isbn.trim()}
              className="mt-2 w-full px-4 py-3 rounded-lg bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors disabled:opacity-50 border-2 border-transparent"
              title="Sync with Google Books"
            >
              {syncing ? "🔄 Syncing..." : "🔄 Sync with Google Books"}
            </button>
            {syncSuccess && (
              <div className="mt-2 p-2 bg-green-500 bg-opacity-20 rounded text-green-500 text-xs">
                ✓ Book data synced from Google Books! Review and save if you want to keep the changes.
              </div>
            )}
          </div>

          {/* Cover URL */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Cover URL
            </label>
            <input
              type="text"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter cover image URL"
              disabled={saving || deleting}
            />
          </div>

          {/* Cover Preview */}
          {coverUrl && (
            <div>
              <label className="block text-sm font-medium text-tg-text mb-2">
                Cover Preview
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={coverUrl}
                  alt="Book cover"
                  className="w-20 h-28 object-cover rounded-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="text-xs text-tg-hint">
                  Cover will be updated when you save
                </div>
              </div>
            </div>
          )}

          {/* Goodreads URL */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Goodreads URL
            </label>
            <input
              type="text"
              value={goodreadsUrl}
              onChange={(e) => setGoodreadsUrl(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter Goodreads URL (optional)"
              disabled={saving || deleting}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none resize-none"
              rows={4}
              placeholder="Enter book description"
              disabled={saving || deleting}
            />
          </div>

          {/* Publication Year */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Publication Year
            </label>
            <input
              type="number"
              value={publicationYear}
              onChange={(e) => setPublicationYear(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter publication year (e.g., 2023)"
              disabled={saving || deleting}
            />
          </div>

          {/* Page Count */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              Page Count
            </label>
            <input
              type="number"
              value={pageCount}
              onChange={(e) => setPageCount(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
              placeholder="Enter page count"
              disabled={saving || deleting}
            />
          </div>

          {saving && isbn !== (book.isbn || "") && (
            <div className="p-3 bg-blue-500 bg-opacity-20 rounded-lg text-blue-500 text-sm">
              🔄 Re-enriching from Google Books...
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-tg-secondary space-y-3">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-[16px] bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors"
              disabled={saving || deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-3 rounded-[16px] bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors disabled:opacity-50 border-2 border-transparent"
              disabled={saving || deleting || !title.trim() || !hasChanges()}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          <button
            onClick={handleDelete}
            className="w-full px-4 py-3 rounded-[16px] bg-red-500 bg-opacity-20 text-red-500 border-2 border-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
            disabled={saving || deleting}
          >
            {deleting ? "Deleting..." : "🗑️ Delete Book"}
          </button>
        </div>
      </div>
    </div>
  );
}
