import {useSyncExternalStore} from "react";
import {usePlan} from "@/features/plan/use-plan";

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Free tier + online, shared by the AdSense script loader and every ad unit
 * — an offline visitor has no connection to serve an ad over, so nothing
 * should even try (docs/10 §10.7, §10.13).
 */
export function useAdsEnabled(): boolean {
  const { plan } = usePlan();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  return plan === "free" && online;
}
