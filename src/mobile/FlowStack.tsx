import {
  createContext,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useDrag } from "@use-gesture/react";
import { useMobileDevice } from "./Device";
import { useKeyboard, useKeyboardDismissDrag, useKeyboardInsets } from "./Keyboard";

export type FlowScreen = {
  id: string;
  title?: string;
  header?: (flow: FlowControls) => ReactNode;
  headerHeight?: number;
  footer?: (flow: FlowControls) => ReactNode;
  footerHeight?: number;
  render: (flow: FlowControls) => ReactNode;
};

type FlowEntry = FlowScreen & {
  key: string;
  returnFocusTo?: HTMLElement | null;
};

export type FlowControls = {
  current: FlowEntry;
  previous: FlowEntry | null;
  stack: FlowEntry[];
  canGoBack: boolean;
  push: (screen: FlowScreen) => void;
  pop: () => void;
  replace: (screen: FlowScreen) => void;
};

const FlowContext = createContext<FlowControls | null>(null);

export function useFlow() {
  const context = useContext(FlowContext);

  if (!context) {
    throw new Error("useFlow must be used inside FlowStack");
  }

  return context;
}

function FlowProvider({ value, children }: PropsWithChildren<{ value: FlowControls }>) {
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

type FlowSceneProps = {
  entry: FlowEntry;
  controls: FlowControls;
  direction: number;
  isTop: boolean;
  isVisible: boolean;
  parkedX: number;
  screenWidth: number;
  swipeX: number;
  register: (key: string, element: HTMLDivElement | null) => void;
};

function FlowScene({ entry, controls, direction, isTop, isVisible, parkedX, screenWidth, swipeX, register }: FlowSceneProps) {
  const isPresent = useIsPresent();
  const isActive = isTop && isPresent;
  const screenVariants = {
    enter: (animationDirection: number) => ({
      x: animationDirection > 0 ? screenWidth : parkedX,
      scale: animationDirection > 0 ? 1 : 0.985,
    }),
    exit: (animationDirection: number) => ({
      x: animationDirection < 0 ? screenWidth : parkedX,
      scale: animationDirection < 0 ? 1 : 0.985,
    }),
  };

  return (
    <motion.div
      ref={(element) => register(entry.key, element)}
      className="flow-screen"
      data-flow-current={isActive ? "true" : "false"}
      data-testid={isActive ? "flow-current" : undefined}
      inert={!isActive}
      tabIndex={-1}
      custom={direction}
      variants={screenVariants}
      initial={isTop ? "enter" : false}
      animate={{
        x: isTop ? swipeX : parkedX,
        scale: isTop ? 1 : 0.985,
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 360, damping: 38, mass: 0.9 }}
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isActive ? "auto" : "none",
        visibility: isVisible ? "visible" : "hidden",
        zIndex: isTop ? 2 : 1,
      }}
    >
      {entry.render(controls)}
    </motion.div>
  );
}

export function FlowStack({ initial }: { initial: FlowScreen }) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();
  const { bottomInset, keyboardDragging } = useKeyboardInsets();
  const dismissKeyboardDrag = useKeyboardDismissDrag();
  const sequence = useRef(1);
  const gestureStartedAtEdge = useRef(false);
  const navigationFocus = useRef<"screen" | "restore" | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const screenElements = useRef(new Map<string, HTMLDivElement>());
  const initialEntry = useRef<FlowEntry>({ ...initial, key: `${initial.id}-0` });
  const [stack, setStack] = useState<FlowEntry[]>(() => [initialEntry.current]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const [direction, setDirection] = useState(1);
  const [swipeX, setSwipeX] = useState(0);

  const toEntry = useCallback((screen: FlowScreen, returnFocusTo?: HTMLElement | null): FlowEntry => {
    const next = sequence.current;
    sequence.current += 1;
    return { ...screen, key: `${screen.id}-${next}`, returnFocusTo };
  }, []);

  const registerScreen = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) screenElements.current.set(key, element);
    else screenElements.current.delete(key);
  }, []);

  const pop = useCallback(() => {
    keyboard.hide();
    const currentEntry = stackRef.current[stackRef.current.length - 1];
    restoreFocusTo.current = currentEntry?.returnFocusTo ?? null;
    navigationFocus.current = "restore";
    setDirection(-1);
    setStack((currentStack) => {
      if (currentStack.length <= 1) return currentStack;
      return currentStack.slice(0, -1);
    });
  }, [keyboard]);

  const controls = useMemo<FlowControls>(() => {
    const current = stack[stack.length - 1];
    const previous = stack.length > 1 ? stack[stack.length - 2] : null;

    return {
      current,
      previous,
      stack,
      canGoBack: stack.length > 1,
      push: (screen) => {
        const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        keyboard.hide();
        navigationFocus.current = "screen";
        setDirection(1);
        setSwipeX(0);
        setStack((currentStack) => [...currentStack, toEntry(screen, returnFocusTo)]);
      },
      pop,
      replace: (screen) => {
        keyboard.hide();
        navigationFocus.current = "screen";
        setDirection(1);
        setSwipeX(0);
        setStack((currentStack) => {
          const replaced = currentStack[currentStack.length - 1];
          const next = currentStack.slice(0, -1);
          return [...next, toEntry(screen, replaced?.returnFocusTo)];
        });
      },
    };
  }, [keyboard, pop, stack, toEntry]);

  const currentKey = stack[stack.length - 1].key;
  useLayoutEffect(() => {
    const focusMode = navigationFocus.current;
    if (!focusMode) return;
    navigationFocus.current = null;

    if (focusMode === "restore") {
      const target = restoreFocusTo.current;
      restoreFocusTo.current = null;
      if (target?.isConnected && !target.closest("[inert]")) {
        target.focus({ preventScroll: true });
        return;
      }
    }

    const screen = screenElements.current.get(currentKey);
    if (!screen) return;
    const heading = screen.querySelector<HTMLElement>("[data-flow-focus], h1, [role='heading']");
    const target = heading ?? screen;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [currentKey]);

  const bindEdgeSwipe = useDrag(
    (state) => {
      if (!controls.canGoBack) return;

      if (state.first) {
        const target = state.event.currentTarget as HTMLElement;
        const bounds = target.getBoundingClientRect();
        gestureStartedAtEdge.current = state.initial[0] - bounds.left < 28;
      }

      if (!gestureStartedAtEdge.current) return;

      const [movementX] = state.movement;
      const [velocityX] = state.velocity;
      const [directionX] = state.direction;
      const nextX = Math.max(0, Math.min(movementX, device.geometry.screen.width));

      if (!state.last) {
        setSwipeX(nextX);
        return;
      }

      const shouldPop = nextX > 92 || (velocityX > 0.45 && directionX > 0);
      setSwipeX(0);
      gestureStartedAtEdge.current = false;

      if (shouldPop) {
        controls.pop();
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  const screenWidth = device.geometry.screen.width;
  const topIndex = stack.length - 1;
  const parkedX = -screenWidth * 0.28;
  const header = controls.current.header?.(controls);
  const headerHeight = controls.current.headerHeight ?? 0;
  const headerSafeArea = header ? device.geometry.safeArea.top : 0;
  const totalHeaderHeight = header ? headerSafeArea + headerHeight : 0;
  const footer = controls.current.footer?.(controls);
  const footerHeight = controls.current.footerHeight ?? 0;

  return (
    <FlowProvider value={controls}>
      <div
        className="flow-stack"
        data-testid="flow-stack"
        data-keyboard-dragging={keyboardDragging ? "true" : "false"}
        style={
          {
            "--flow-header-height": `${totalHeaderHeight}px`,
            "--flow-header-content-height": `${headerHeight}px`,
            "--flow-header-safe-area": `${headerSafeArea}px`,
            "--flow-footer-height": `${footer ? footerHeight : 0}px`,
            "--keyboard-height": `${bottomInset}px`,
          } as CSSProperties
        }
        {...bindEdgeSwipe()}
      >
        {header ? (
          <header className="flow-fixed-header" data-testid="flow-fixed-header">
            {header}
          </header>
        ) : null}
        <div className="flow-scenes">
          <AnimatePresence initial={false} custom={direction}>
            {stack.map((entry, index) => {
              const isTop = index === topIndex;
              const isVisible = index >= topIndex - 1;

              return <FlowScene key={entry.key} entry={entry} controls={controls} direction={direction} isTop={isTop} isVisible={isVisible} parkedX={parkedX} screenWidth={screenWidth} swipeX={swipeX} register={registerScreen} />;
            })}
          </AnimatePresence>
        </div>
        {footer ? (
          <footer className="flow-fixed-footer" data-testid="flow-fixed-footer" {...dismissKeyboardDrag}>
            {footer}
          </footer>
        ) : null}
      </div>
    </FlowProvider>
  );
}
