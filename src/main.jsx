import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LogiCostApp from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LogiCostApp />
  </StrictMode>
);
