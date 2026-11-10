import { useState } from 'react';

/**
 * Delete a payment (#389): a soft delete with an optional note. The payment stays in the history,
 * marked deleted, and its nights become unpaid. There is no restore: to undo, pay again.
 * Remount it per payment (a `key`) so the note starts empty each time.
 * @requirements REQ-042
 */
export default function DeletePaymentDialog({ isOpen, message, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm(note);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={saving ? undefined : onCancel} />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div
          role="dialog"
          aria-labelledby="delete-payment-title"
          className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-sm md:mx-4 animate-slideUp md:animate-scaleIn"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="p-5">
            <div className="md:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
            <h3 id="delete-payment-title" className="text-base font-semibold text-slate-900 mb-1">Delete Payment Record</h3>
            <p className="text-sm text-slate-600">{message}</p>

            <label htmlFor="delete-payment-note" className="block mt-4 text-sm font-medium text-slate-700">
              Note (optional)
            </label>
            <textarea
              id="delete-payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Why it's being deleted"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
