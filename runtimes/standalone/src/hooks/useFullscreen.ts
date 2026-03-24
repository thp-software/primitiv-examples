import { useState, useEffect, useCallback, type RefObject } from "react";

/**
 * useFullscreen - Hook to manage full screen state for a specific element.
 *
 * @param elementRef The ref of the element to make full screen
 * @returns { isFullscreen, toggleFullscreen }
 */
export function useFullscreen(elementRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [elementRef]);

  const toggleFullscreen = useCallback(async () => {
    if (!elementRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await elementRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error(`Error attempting to toggle full-screen mode: ${err}`);
    }
  }, [elementRef]);

  return { isFullscreen, toggleFullscreen };
}
