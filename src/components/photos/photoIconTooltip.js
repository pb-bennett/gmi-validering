// One tooltip behaviour for every icon-only photo control, including Leaflet-owned DOM (the rotation knob).
// Hover (fine pointer) shows after a short delay, keyboard focus-visible shows immediately, Escape dismisses
// only the tooltip and consumes that keypress. The tooltip is hoverable and never the only source of meaning.
const HOVER_DELAY_MS = 300;
const HIDE_GRACE_MS = 120;
let serial = 0;

export function attachPhotoIconTooltip(element) {
  if (!element) return { update() {}, hide() {}, destroy() {} };
  const id = `photo-icon-tooltip-${++serial}`;
  let options = { text: '', label: '' };
  let tip = null, showTimer = null, hideTimer = null;

  const clearTimers = () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  const describedBy = (add) => {
    const ids = new Set((element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    if (add) ids.add(id); else ids.delete(id);
    if (ids.size) element.setAttribute('aria-describedby', [...ids].join(' '));
    else element.removeAttribute('aria-describedby');
  };
  const place = () => {
    if (!tip) return;
    const anchor = element.getBoundingClientRect(), box = tip.getBoundingClientRect();
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - 4) top = Math.max(4, anchor.top - box.height - 6);
    const left = Math.max(4, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 4));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  };
  const decorate = () => {
    tip.textContent = options.text;
    // Same text as the accessible name: hide it from AT so it is not announced twice.
    if (options.text === options.label) {
      tip.removeAttribute('role'); tip.setAttribute('aria-hidden', 'true'); describedBy(false);
    } else {
      tip.setAttribute('role', 'tooltip'); tip.removeAttribute('aria-hidden'); describedBy(true);
    }
  };
  const show = () => {
    clearTimers();
    if (!options.text || !element.isConnected || element.closest('.photo-edit-gesture')) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.id = id; tip.className = 'photo-icon-tooltip';
      tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
      tip.addEventListener('pointerleave', scheduleHide);
    }
    decorate();
    // Inside a modal dialog the tooltip must join its top layer; elsewhere it floats above map panes.
    (element.closest('dialog[open]') || document.body).append(tip);
    element.dataset.tooltipOpen = 'true';
    place();
  };
  const hide = () => {
    clearTimers();
    if (tip?.isConnected) tip.remove();
    describedBy(false);
    delete element.dataset.tooltipOpen;
  };
  function scheduleHide() { clearTimeout(showTimer); clearTimeout(hideTimer); hideTimer = setTimeout(hide, HIDE_GRACE_MS); }

  const onPointerEnter = (event) => {
    // Touch and pen taps trigger the action; the aria-label covers assistive technology.
    if (event.pointerType !== 'mouse') return;
    clearTimeout(hideTimer);
    if (tip?.isConnected) return;
    showTimer = setTimeout(show, HOVER_DELAY_MS);
  };
  const onFocus = () => { if (element.matches(':focus-visible')) show(); };
  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || !tip?.isConnected) return;
    event.preventDefault(); event.stopPropagation();
    hide();
  };
  const onViewportChange = () => { if (tip?.isConnected) hide(); };
  element.addEventListener('pointerenter', onPointerEnter);
  element.addEventListener('pointerleave', scheduleHide);
  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', hide);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  return {
    update(next) {
      options = { text: next.text || '', label: next.label || '' };
      if (!tip?.isConnected) return;
      if (!options.text) hide(); else { decorate(); place(); }
    },
    hide,
    destroy() {
      hide();
      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointerleave', scheduleHide);
      element.removeEventListener('focus', onFocus);
      element.removeEventListener('blur', hide);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    },
  };
}
