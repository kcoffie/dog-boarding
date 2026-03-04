/**
 * Modal displaying a dog's boarding information form.
 * Shows date discrepancy alerts, priority fields, and all remaining fields.
 * Supports print via window.print().
 *
 * @requirements REQ-503, REQ-504
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Format a YYYY-MM-DD date as "Mon DD, YYYY" (e.g. "Feb 13, 2026").
 * Returns the original string if parsing fails.
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a booking date from an ISO datetime string as "Mon DD, YYYY".
 */
function formatBookingDate(isoDatetime) {
  if (!isoDatetime) return '';
  const d = new Date(isoDatetime);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get initials from a dog name (first letter of first and last word).
 */
function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/**
 * Single form field row.
 */
function FieldRow({ label, value }) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm text-slate-900 whitespace-pre-wrap">{value || <span className="text-slate-400 italic">Not provided</span>}</div>
    </div>
  );
}

export default function BoardingFormModal({ isOpen, onClose, dogName, formData, boarding }) {
  const modalRef = useRef(null);

  // Escape key + body overflow lock
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const initials = getInitials(dogName);
  const priorityFields = formData?.form_data?.priorityFields || [];
  const otherFields = formData?.form_data?.otherFields || [];
  const dateMismatch = formData?.date_mismatch;
  const submittedDate = formData?.form_submitted_at ? formatDate(formData.form_submitted_at) : null;
  const hasContent = priorityFields.length > 0 || otherFields.length > 0;

  function handlePrint() {
    const win = window.open('', '_blank');
    if (!win) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print the form.');
      return;
    }

    function esc(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const priorityRows = priorityFields
      .map(f => `<tr><th>${esc(f.label)}</th><td>${esc(f.value) || '<em>Not provided</em>'}</td></tr>`)
      .join('');

    const otherRows = otherFields
      .map(f => `<tr><th>${esc(f.label)}</th><td>${esc(f.value) || '<em>Not provided</em>'}</td></tr>`)
      .join('');

    const divider = otherFields.length > 0
      ? `<tr><td colspan="2" class="divider">Additional Information</td></tr>`
      : '';

    const alertHtml = dateMismatch && boarding
      ? `<div class="alert">⚠ Date Discrepancy — Booking: ${esc(formatBookingDate(boarding.arrivalDateTime))} → ${esc(formatBookingDate(boarding.departureDateTime))} | Form says: ${esc(formatDate(formData.form_arrival_date))} → ${esc(formatDate(formData.form_departure_date))}<br><small>The client confirmed different dates on this form.</small></div>`
      : '';

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${esc(dogName)} — Boarding Form</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; color: #1e293b; margin: 24px 32px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 2px; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 7px 12px 7px 0; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; width: 32%; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
    td { padding: 7px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; white-space: pre-wrap; vertical-align: top; }
    .divider { text-align: center; padding: 10px 0 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; border-bottom: 1px solid #e2e8f0; }
    .alert { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #92400e; }
    em { color: #94a3b8; font-style: italic; }
  </style>
</head>
<body>
  <h1>${esc(dogName)} — Boarding Form</h1>
  ${submittedDate ? `<div class="meta">Submitted: ${esc(submittedDate)}</div>` : ''}
  ${alertHtml}
  <table>${priorityRows}${divider}${otherRows}</table>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:bg-transparent print:p-0 print:block">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col boarding-form-print-content print:rounded-none print:shadow-none print:max-h-none print:overflow-visible"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:border-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-indigo-600">{initials}</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{dogName} — Boarding Form</h2>
              {submittedDate && (
                <p className="text-xs text-slate-500">Submitted: {submittedDate}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors print:hidden"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 print:overflow-visible">
          {/* Date mismatch alert */}
          {dateMismatch && boarding && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Date Discrepancy</p>
                  <p className="text-sm text-amber-700 mt-1">
                    <span className="font-medium">Booking:</span>{' '}
                    {formatBookingDate(boarding.arrivalDateTime)} → {formatBookingDate(boarding.departureDateTime)}
                    {' '}|{' '}
                    <span className="font-medium">Form says:</span>{' '}
                    {formatDate(formData.form_arrival_date)} → {formatDate(formData.form_departure_date)}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">The client confirmed different dates on this form.</p>
                </div>
              </div>
            </div>
          )}

          {/* No form available */}
          {!formData && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              No boarding form found for this dog. The form may not have been submitted yet, or the pet ID has not been synced.
            </div>
          )}

          {/* Priority fields */}
          {priorityFields.length > 0 && (
            <div>
              {priorityFields.map(field => (
                <FieldRow key={field.fieldId} label={field.label} value={field.value} />
              ))}
            </div>
          )}

          {/* Additional fields */}
          {otherFields.length > 0 && (
            <div>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Additional Information</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
              {otherFields.map(field => (
                <FieldRow key={field.fieldId} label={field.label} value={field.value} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {formData && priorityFields.length === 0 && otherFields.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No form fields found.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            {formData?.submission_url && (
              <a
                href={formData.submission_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors print:hidden"
              >
                View on site →
              </a>
            )}
            {hasContent && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
