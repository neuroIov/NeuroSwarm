"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  trackPageView,
  trackUserEngagement,
  trackSessionStart,
  trackSessionEnd,
  isAnalyticsEnabled,
} from "@/lib/analytics";

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

interface GoogleAnalyticsProps {
  GA_MEASUREMENT_ID: string;
}

export function GoogleAnalytics({ GA_MEASUREMENT_ID }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionStartTime = useRef<number>(Date.now());
  const lastActivityTime = useRef<number>(Date.now());
  const engagementInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize gtag
  useEffect(() => {
    if (typeof window !== "undefined" && !window.gtag && isAnalyticsEnabled) {
      window.gtag = function () {
        (window.gtag as any).q = (window.gtag as any).q || [];
        (window.gtag as any).q.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_MEASUREMENT_ID, {
        page_title: document.title,
        page_location: window.location.href,
        send_page_view: false, // We'll handle page views manually
      });
    }
  }, [GA_MEASUREMENT_ID]);

  // Track page views
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.gtag === "function" &&
      isAnalyticsEnabled
    ) {
      const url = pathname + searchParams.toString();
      trackPageView(url, document.title);
    }
  }, [pathname, searchParams]);

  // Track user engagement
  useEffect(() => {
    if (!isAnalyticsEnabled) return;

    const updateActivity = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityTime.current;

      // Track engagement if user was active for more than 10 seconds
      if (timeSinceLastActivity > 10000) {
        trackUserEngagement(timeSinceLastActivity);
      }

      lastActivityTime.current = now;
    };

    // Track activity on user interactions
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Track engagement every 60 seconds
    engagementInterval.current = setInterval(() => {
      const now = Date.now();
      const engagementTime = now - lastActivityTime.current;
      if (engagementTime > 0) {
        trackUserEngagement(engagementTime);
      }
    }, 60000);

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity);
      });
      if (engagementInterval.current) {
        clearInterval(engagementInterval.current);
      }
    };
  }, []);

  // Track session start
  useEffect(() => {
    if (isAnalyticsEnabled) {
      trackSessionStart();
    }
  }, []);

  // Track session end on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isAnalyticsEnabled) {
        const sessionDuration = Date.now() - sessionStartTime.current;
        trackSessionEnd(sessionDuration);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isAnalyticsEnabled) {
        const sessionDuration = Date.now() - sessionStartTime.current;
        trackSessionEnd(sessionDuration);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
