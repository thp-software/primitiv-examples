import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";
import { StatsOverlay } from "./StatsOverlay";

interface PrimitivClientWGPUSingleProps {
  /** The Primitiv Application instance to run */
  application: IApplication;
  /** Grid width in cells (default: 80) */
  width?: number;
  /** Grid height in cells (default: 24) */
  height?: number;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Whether to enable autoplay (default: true) */
  autoplay?: boolean;
  /** Whether the client is in full screen mode */
  isFullscreen?: boolean;
}

const PrimitivClientWGPUSingle: React.FC<PrimitivClientWGPUSingleProps> = ({
  application,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  isFullscreen = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const [activeRuntime, setActiveRuntime] = useState<ClientRuntime | null>(null);

  const supportsWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const renderer = RendererType.TerminalWGPU;

  const depsKey = `${application.constructor.name}-${renderer}-clean-${width}-${height}-${autoplay}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !supportsWebGpu) return;

    if (initializedWithKeyRef.current === depsKey) return;

    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }
    container.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    const runtime = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [
        // Back to normal: only one display on ID 0
        { displayId: 0, container, renderer },
      ],
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
      if (container) {
        container.innerHTML = "";
      }
      initializedWithKeyRef.current = null;
    };
  }, [application, renderer, width, height, autoplay, depsKey, supportsWebGpu]);

  if (!supportsWebGpu) {
    return (
      <div
        className={`primitiv-client ${className}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#e2e8f0",
          padding: "1rem",
          textAlign: "center",
          ...style,
        }}
      >
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            WebGPU not supported on this device/browser.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`primitiv-client ${className}`}
      style={{ display: "flex", ...style }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        <div ref={containerRef} style={{ flex: 1 }} />
      </div>
      <StatsOverlay runtime={activeRuntime} show={!isFullscreen} />
    </div>
  );
};

export default PrimitivClientWGPUSingle;
