import { createRoot } from "react-dom/client";
import { PrototypeErrorBoundary } from "../src/Prototype";
import "../src/prototype.css";

function BrokenScreen(): never {
  throw new Error("Erreur volontaire du test de récupération");
}

createRoot(document.getElementById("root")!).render(
  <PrototypeErrorBoundary>
    <BrokenScreen />
  </PrototypeErrorBoundary>,
);
