import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(container);

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
          <h1 style={{ marginBottom: 8 }}>App failed to render</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const renderBootError = (error) => {
  root.render(
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>App failed to load</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{String(error)}</pre>
    </div>
  );
};

import("./App.jsx")
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>
    );
  })
  .catch((error) => {
    renderBootError(error);
  });

window.addEventListener("unhandledrejection", (event) => {
  renderBootError(event.reason || new Error("Unhandled promise rejection"));
});
