import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";

export default function App() {
  return (
    <MobileDeviceProvider>
      <KeyboardProvider simulated={false}>
        <div
          className="mobile-app-viewport web-app-viewport"
          data-keyboard-visible="false"
          data-platform="web"
          data-testid="mobile-app-viewport"
        >
          <Prototype />
        </div>
      </KeyboardProvider>
    </MobileDeviceProvider>
  );
}
