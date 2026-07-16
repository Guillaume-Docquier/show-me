/**
 * Browser-bundle entrypoint.
 *
 * The static report renderer replaces this foundation marker in milestone 003.
 */
function markBrowserBundleReady(): void {
  document.documentElement.dataset.showMeBrowserBundle = "ready"
}

markBrowserBundleReady()
