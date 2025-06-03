import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Provider } from "react-redux";
import { store } from "./store";
import { startupService } from "./services/startupService";
import "./i18n";

// Store must be initialized before services
// Wait for store to be fully initialized
setTimeout(() => {
  // Initialize all services after store is ready
  startupService.init();
}, 0);

// Add event listener for cleanup on window unload
window.addEventListener("beforeunload", () => {
  startupService.cleanup();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
