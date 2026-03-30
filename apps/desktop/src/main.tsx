import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

// Handle Gmail OAuth2 popup callback: Google redirects here with ?code=...
// The popup detects this, forwards the code to the opener, then closes itself.
const urlParams = new URLSearchParams(window.location.search);
const oauthCode = urlParams.get("code");
if (oauthCode && window.opener) {
  window.opener.postMessage(
    { type: "gmail-oauth-callback", code: oauthCode, state: urlParams.get("state") },
    window.location.origin,
  );
  window.close();
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
