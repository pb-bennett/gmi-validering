import { useEffect, useLayoutEffect, useRef } from 'react';

/** Puts a native dialog that fills the viewport back to a plain overlay; the overlay's own classes supply the backdrop. */
export const MODAL_OVERLAY_RESET = 'm-0 h-full w-full max-h-none max-w-none overflow-hidden border-0 text-gmi-text backdrop:bg-transparent';

/**
 * Lifecycle of a conditionally rendered native <dialog>. showModal() supplies the top layer, background inertness and
 * focus containment; this adds initial focus, Escape and focus restoration.
 * - `initialFocus`: selector inside the dialog; the first focusable element otherwise.
 * - `returnFocus`: selector used when the opener no longer exists.
 * - `onEscape`: returns true when Escape was used by something inside the dialog, which then stays open.
 *
 * Escape is handled here and not left to the browser, which may close a stack of dialogs at once when they were opened
 * without user activation. The innermost dialog gets its own `cancel`, as it would natively.
 */
export default function useModalDialog(open, onClose, { initialFocus, returnFocus, onEscape } = {}) {
  const ref = useRef(null);
  const latest = useRef({ onClose, onEscape });
  useEffect(() => { latest.current = { onClose, onEscape }; });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return undefined;
    const opener = document.activeElement;
    // The workspace behind the dialog must not act on the Escape that closes it.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.stopPropagation();
      event.preventDefault();
      const inner = event.target.closest('dialog');
      if (inner !== dialog) { inner.dispatchEvent(new Event('cancel', { cancelable: true })); return; }
      if (!latest.current.onEscape?.()) latest.current.onClose();
    };
    dialog.addEventListener('keydown', onKeyDown);
    dialog.showModal();
    if (initialFocus) dialog.querySelector(initialFocus)?.focus();
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.close();
      const usable = opener?.isConnected && opener !== document.body;
      (usable ? opener : returnFocus && document.querySelector(returnFocus))?.focus();
    };
  }, [open, initialFocus, returnFocus]);

  return {
    ref,
    onCancel: (event) => {
      // A file picker inside the dialog sends its own bubbling `cancel`: dismissing the picker never closes the dialog.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onClose();
    },
  };
}
