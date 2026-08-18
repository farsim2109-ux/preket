/** MetaMask (and similar) inject inpage.js; auto-reconnect can throw before React mounts. */
export function SuppressExtensionWalletErrors() {
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  function isWalletExtensionNoise(value) {
    var msg = String(
      value && value.message ? value.message : value || ""
    ).toLowerCase();
    return (
      msg.indexOf("metamask") !== -1 ||
      msg.indexOf("failed to connect") !== -1 ||
      (msg.indexOf("ethereum") !== -1 && msg.indexOf("connect") !== -1)
    );
  }
  window.addEventListener("unhandledrejection", function (event) {
    if (isWalletExtensionNoise(event.reason)) {
      event.preventDefault();
    }
  });
  window.addEventListener("error", function (event) {
    if (isWalletExtensionNoise(event.message)) {
      event.preventDefault();
    }
  });
})();
`,
      }}
    />
  );
}
