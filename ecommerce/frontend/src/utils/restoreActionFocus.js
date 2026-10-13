// A pending/removed trigger cannot receive MUI's automatic restore focus.
// Run after the closing transition, without overriding the user's new focus.
export function restoreActionFocus(trigger, fallback) {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    if ((trigger?.isConnected && trigger.disabled) || (!trigger?.isConnected && fallback?.disabled)) return;
    const available = node => node?.isConnected && !node.disabled && !node.closest('[aria-hidden="true"]');
    const target = available(trigger) ? trigger : available(fallback) ? fallback : document.querySelector('main h1');
    if (available(target)) target.focus();
  });
}
