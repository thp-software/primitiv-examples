import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";
import { StatsOverlay } from "./StatsOverlay";

interface PrimitivClientWGPUProps {
  application: IApplication;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  autoplay?: boolean;
  /** Whether the client is in full screen mode */
  isFullscreen?: boolean;
}

const PrimitivClientWGPU: React.FC<PrimitivClientWGPUProps> = ({
  application,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  isFullscreen = false,
}) => {
  const container2dRef = useRef<HTMLDivElement | null>(null);
  const containerGlRef = useRef<HTMLDivElement | null>(null);
  const containerWgpuRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const [activeRuntime, setActiveRuntime] = useState<ClientRuntime | null>(
    null,
  );

  const supportsWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const forcedRenderer = RendererType.TerminalWGPU;

  const depsKey = `${application.constructor.name}-${forcedRenderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    const container2d = container2dRef.current;
    const containerGl = containerGlRef.current;
    const containerWgpu = containerWgpuRef.current;
    if (!container2d || !containerGl || !containerWgpu) return;

    if (initializedWithKeyRef.current === depsKey) return;

    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }
    container2d.innerHTML = "";
    containerGl.innerHTML = "";
    containerWgpu.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    const runtime = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [
        {
          displayId: 0,
          container: container2d,
          renderer: RendererType.Terminal2D,
        },
        {
          displayId: 1,
          container: containerGl,
          renderer: RendererType.TerminalGL,
        },
        { displayId: 2, container: containerWgpu, renderer: forcedRenderer },
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
      container2d.innerHTML = "";
      containerGl.innerHTML = "";
      containerWgpu.innerHTML = "";
      initializedWithKeyRef.current = null;
    };
  }, [application, forcedRenderer, width, height, autoplay, depsKey]);

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
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            WebGPU not supported on this device/browser.
          </div>
          <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
            This view is WGPU-only and does not fallback to WebGL.
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
        <div
          style={{
            padding: "0.35rem 0.5rem",
            fontSize: "0.75rem",
            color: "#94a3b8",
            background: "rgba(15, 23, 42, 0.9)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Left: Terminal2D
        </div>
        <div ref={container2dRef} style={{ flex: 1 }} />
      </div>
      <div style={{ width: "8px", background: "#020617" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        <div
          style={{
            padding: "0.35rem 0.5rem",
            fontSize: "0.75rem",
            color: "#94a3b8",
            background: "rgba(15, 23, 42, 0.9)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Middle: TerminalGL
        </div>
        <div ref={containerGlRef} style={{ flex: 1 }} />
      </div>
      <div style={{ width: "8px", background: "#020617" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        <div
          style={{
            padding: "0.35rem 0.5rem",
            fontSize: "0.75rem",
            color: "#94a3b8",
            background: "rgba(15, 23, 42, 0.9)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Right: TerminalWGPU
        </div>
        <div ref={containerWgpuRef} style={{ flex: 1 }} />
      </div>
      <StatsOverlay runtime={activeRuntime} show={!isFullscreen} />
    </div>
  );
};

export default PrimitivClientWGPU;
