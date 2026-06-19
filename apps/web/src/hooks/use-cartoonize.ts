"use client";

import { useState, useEffect, useCallback } from "react";
import { downscaleIfNeeded } from "@/lib/image-helpers";

interface UseCartoonizeResult {
  loading: boolean;
  error: string | null;
  enabled: boolean;
  cartoonize: (dataUrl: string) => Promise<string | null>;
}

export function useCartoonize(): UseCartoonizeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/cartoonize")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const cartoonize = useCallback(async (dataUrl: string): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const scaled = await downscaleIfNeeded(dataUrl);
      const res = await fetch("/api/cartoonize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: scaled }),
      });
      const data = await res.json();
      if (data.disabled) {
        setError("Cartoonize is disabled. Add DEEPAI_API_KEY to .env.local.");
        return null;
      }
      if (data.error) {
        setError(data.error);
        return null;
      }
      if (!data.outputUrl) {
        setError("Cartoonize failed. Please try again.");
        return null;
      }
      return data.outputUrl as string;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, enabled, cartoonize };
}
