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
  /** Whether to show the network/perf stats overlay */
  showStats?: boolean;
}

const PrimitivClientWGPU: React.FC<PrimitivClientWGPUProps> = ({
  application,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  isFullscreen = false,
  showStats = true,
}) => {
  const container2dRef = useRef<HTMLDivElement | null>(null);
  const containerGlRef = useRef<HTMLDivElement | null>(null);
  const containerWgpuRef = useRef<HTMLDivElement | null>(null);
  const runtime2dRef = useRef<ClientRuntime | null>(null);
  const runtimeGlRef = useRef<ClientRuntime | null>(null);
  const runtimeWgpuRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const [rt2d, setRt2d] = useState<ClientRuntime | null>(null);
  const [rtGl, setRtGl] = useState<ClientRuntime | null>(null);
  const [rtWgpu, setRtWgpu] = useState<ClientRuntime | null>(null);

  const supportsWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const forcedRenderer = RendererType.TerminalWGPU;

  const depsKey = `${application.constructor.name}-${forcedRenderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    const container2d = container2dRef.current;
    const containerGl = containerGlRef.current;
    const containerWgpu = containerWgpuRef.current;
    if (!container2d || !containerGl || !containerWgpu) return;

    if (initializedWithKeyRef.current === depsKey) return;

    if (runtime2dRef.current) runtime2dRef.current.destroy();
    if (runtimeGlRef.current) runtimeGlRef.current.destroy();
    if (runtimeWgpuRef.current) runtimeWgpuRef.current.destroy();
    runtime2dRef.current = null;
    runtimeGlRef.current = null;
    runtimeWgpuRef.current = null;
    
    container2d.innerHTML = "";
    containerGl.innerHTML = "";
    containerWgpu.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    const rtT2D = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [
        {
          displayId: 0,
          container: container2d,
          renderer: RendererType.Terminal2D,
        },
      ],
      autoplay,
      debug: true,
      logLevel: "warn",
    });

    const rtTGL = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [
        {
          displayId: 0,
          container: containerGl,
          renderer: RendererType.TerminalGL,
        },
      ],
      autoplay,
      debug: true,
      logLevel: "warn",
    });

    const rtWGPU = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [
        { displayId: 0, container: containerWgpu, renderer: forcedRenderer },
      ],
      autoplay,
      debug: true,
      logLevel: "warn",
    });

    runtime2dRef.current = rtT2D;
    runtimeGlRef.current = rtTGL;
    runtimeWgpuRef.current = rtWGPU;
    setRt2d(rtT2D);
    setRtGl(rtTGL);
    setRtWgpu(rtWGPU);

    return () => {
      const r1 = runtime2dRef.current;
      const r2 = runtimeGlRef.current;
      const r3 = runtimeWgpuRef.current;
      runtime2dRef.current = null;
      runtimeGlRef.current = null;
      runtimeWgpuRef.current = null;
      setRt2d(null);
      setRtGl(null);
      setRtWgpu(null);
      if (r1) r1.destroy();
      if (r2) r2.destroy();
      if (r3) r3.destroy();
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
        <StatsOverlay runtime={rt2d} show={!isFullscreen && showStats} />
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
        <StatsOverlay runtime={rtGl} show={!isFullscreen && showStats} />
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
        <StatsOverlay runtime={rtWgpu} show={!isFullscreen && showStats} />
      </div>
    </div>
  );
};

export default PrimitivClientWGPU;
