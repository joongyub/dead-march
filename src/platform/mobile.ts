/**
 * Browser-level guards so the page behaves like an app on phones:
 * no pinch/double-tap zoom, no scrolling or pull-to-refresh, no long-press menu or text selection.
 * CSS in index.html covers most of this; these listeners cover iOS Safari, which ignores user-scalable=no.
 */
export function installMobileGuards(): void {
  const block = (event: Event) => event.preventDefault();
  const options: AddEventListenerOptions = { passive: false };

  document.addEventListener('gesturestart', block, options);
  document.addEventListener('gesturechange', block, options);
  document.addEventListener('gestureend', block, options);
  document.addEventListener('dblclick', block, options);
  document.addEventListener('contextmenu', block, options);
  document.addEventListener('selectstart', block, options);
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    options,
  );
}
