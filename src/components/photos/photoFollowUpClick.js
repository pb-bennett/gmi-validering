// A handoff swaps what is under the cursor, so the second click of a double-click would land on the next screen: a map
// click there places a photo, and a hub button there accepts values. Single clicks and the keyboard are not affected.
const FOLLOW_UP_MS = 600;
const EVENTS = Object.freeze(['click', 'dblclick']);

export function ignoreFollowUpClick() {
  const stop = (event) => { if (event.detail > 1) { event.preventDefault(); event.stopPropagation(); } };
  EVENTS.forEach((type) => window.addEventListener(type, stop, true));
  setTimeout(() => EVENTS.forEach((type) => window.removeEventListener(type, stop, true)), FOLLOW_UP_MS);
}
