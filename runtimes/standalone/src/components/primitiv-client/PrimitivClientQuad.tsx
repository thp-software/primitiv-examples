import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";
import { StatsOverlay } from "./StatsOverlay";

interface PrimitivClientQuadProps {
  /** The Primitiv Application instance to run */
  application: IApplication;
  /** Renderer type (default: TerminalGL) */
  renderer?: RendererType;
  /** Optional width to pass down (not used for layout) */
  width?: number;
  /** Optional height to pass down (not used for layout) */
  height?: number;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Whether to enable autoplay (default: true) */
  autoplay?: boolean;
  /** Pixel gap between display containers (default: 8) */
  gap?: number;
}

/**
 * PrimitivClientQuad - React wrapper for 4-display applications in a 2x2 grid.
 */
const PrimitivClientQuad: React.FC<PrimitivClientQuadProps> = ({
  application,
  renderer = RendererType.TerminalGL,
  className = "",
  style,
  autoplay = true,
  gap = 8,
}) => {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const [activeRuntime, setActiveRuntime] = useState<ClientRuntime | null>(
    null,
  );

  const depsKey = `${application.constructor.name}-${renderer}-${autoplay}`;

  useEffect(() => {
    // Collect 4 containers
    const containers: HTMLDivElement[] = [];
    for (let i = 0; i < 4; i++) {
      const c = containerRefs.current[i];
      if (!c) return;
      containers.push(c);
    }

    // Strict Mode protection
    if (initializedWithKeyRef.current === depsKey) return;

    // HMR cleanup
    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }
    for (const c of containers) c.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    // Initialize runtime with 4 display slots
    const runtime = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: containers.map((container, i) => ({
        displayId: i,
        container,
        renderer,
      })) as any,
      autoplay,
      debug: true,
      logLevel: "warn",
    });

    runtimeRef.current = runtime;
    setActiveRuntime(runtime);

    return () => {
      const rt = runtimeRef.current;
      runtimeRef.current = null;
      setActiveRuntime(null);
      if (rt) {
        rt.destroy();
      }
      containerRefs.current.forEach((container) => {
        if (container) {
          container.innerHTML = "";
        }
      });
      initializedWithKeyRef.current = null;
    };
  }, [application, renderer, autoplay, depsKey]);

  return (
    <div
      className={`primitiv-client ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: `${gap}px`,
        padding: `${gap}px`,
        boxSizing: "border-box",
        backgroundColor: "#050505",
        ...style,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          ref={(el) => {
            containerRefs.current[i] = el;
          }}
          style={{ 
            position: "relative",
            minHeight: 0,
            background: "#000",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "4px",
            overflow: "hidden"
          }}
        />
      ))}
      <StatsOverlay runtime={activeRuntime} />
    </div>
  );
};

export default PrimitivClientQuad;
