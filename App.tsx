// CRITICAL: Polyfill BroadcastChannel and LockManager BEFORE any imports
// This must execute first to prevent SecurityError in non-secure contexts
if (typeof window !== 'undefined' && !(window as any).__SUPABASE_POLYFILLS_APPLIED__) {
  (window as any).__SUPABASE_POLYFILLS_APPLIED__ = true;
  
  // Minimal no-op BroadcastChannel
  class SafeBroadcastChannel {
    name: string;
    onmessage = null;
    onmessageerror = null;
    constructor(name: string) { this.name = name || ''; }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
  }
  
  // Try to override - if it fails, continue silently
  try {
    (window as any).BroadcastChannel = SafeBroadcastChannel;
  } catch (e) {
    // Ignore - BroadcastChannel is read-only
  }

  // Safe navigator.locks
  if (typeof navigator !== 'undefined') {
    const safeLocks = {
      request: async (n: string, o: any, cb?: any) => {
        const callback = typeof o === 'function' ? o : cb;
        if (callback) return await callback({ name: n, mode: 'exclusive' });
        return Promise.resolve();
      },
      query: async () => ({ held: [], pending: [] }),
    };
    
    // Only try to override if locks doesn't exist
    // navigator.locks is often read-only
    try {
      if (!(navigator as any).locks) {
        Object.defineProperty(navigator, 'locks', { value: safeLocks, configurable: true });
      }
    } catch (e) {
      // navigator.locks is read-only - silently ignore
    }
  }
  
  console.log('[App] Polyfills applied silently');
}

import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { initializeIntegrations, DEFAULT_CONFIG } from "../utils/integrations";
import { initFetchErrorSuppression } from "../utils/fetchFallback";
import { AuthProvider } from "./context/AuthContext";
import { MastermindProvider } from "./context/MastermindContext";
import { GuestProvider } from "./context/GuestContext";
import { SyncProvider } from "./context/SyncContext";
import { MessagingProvider } from "./context/MessagingContext";
import { CompanyProvider } from "./context/CompanyContext";
import { ActivityProvider } from "./context/ActivityContext";

/**
 * Root application component.
 * All context providers are lifted here (above RouterProvider) so that
 * every route — including error boundaries — has access to them.
 *
 * The hydration loading spinner lives in routes.tsx as `HydrateFallback`
 * on the root route — that is the React Router v7 API for initial-paint
 * loading states. `fallbackElement` (v6) and wrapping RouterProvider in
 * <Suspense> both cause "suspended during synchronous input" errors and
 * must not be used.
 */
export default function App() {
  useEffect(() => {
    try {
      // Initialize fetch error suppression for offline mode
      initFetchErrorSuppression();
      
      // Initialize integrations
      initializeIntegrations(DEFAULT_CONFIG);
    } catch (error) {
      console.error("Failed to initialize integrations:", error);
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <CompanyProvider>
          <ActivityProvider>
            <MastermindProvider>
              <GuestProvider>
                <SyncProvider>
                  <MessagingProvider>
                    <RouterProvider router={router} />
                    <Toaster position="top-right" richColors closeButton />
                  </MessagingProvider>
                </SyncProvider>
            </GuestProvider>
          </MastermindProvider>
          </ActivityProvider>
        </CompanyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}