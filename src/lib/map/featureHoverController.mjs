export const HOVER_DELAY_MS = 500;

// One timer and one visible tooltip for the entire semantic feature layer.
export function createFeatureHoverController({ show, hide, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = null;
  let timer = null;
  let visible = false;

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    active = null;
    if (visible) hide();
    visible = false;
  }

  return {
    enter(featureLayer, payload) {
      if (active === featureLayer) return;
      cancel();
      active = featureLayer;
      timer = setTimer(() => {
        timer = null;
        if (active !== featureLayer) return;
        show(payload);
        visible = true;
      }, HOVER_DELAY_MS);
    },
    leave(featureLayer) {
      if (active === featureLayer) cancel();
    },
    cancel,
  };
}
