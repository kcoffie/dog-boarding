import { useState, useEffect } from 'react';
import { CONFIRM_TIMEOUT_MS } from '../utils/constants';

export default function InlineDeleteButton({ onDelete, disabled = false, className = '' }) {
  const [confirming, setConfirming] = useState(false);

  // Reset confirming state after timeout
  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  const handleClick = async () => {
    if (disabled) return;

    if (!confirming) {
      setConfirming(true);
    } else {
      await onDelete();
      setConfirming(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg transition-all select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${confirming
          ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
          : 'text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200'
        }
        ${className}
      `}
    >
      {confirming ? 'Tap to confirm' : 'Delete'}
    </button>
  );
}
