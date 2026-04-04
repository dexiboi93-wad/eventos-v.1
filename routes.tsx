import { createBrowserRouter, Outlet } from "react-router";
import React from "react";
import DashboardLayout from "./layouts/DashboardLayout";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import AuthGuard from "./components/AuthGuard";
import { Crown } from "lucide-react";

/**
 * Shown by React Router v7 during initial hydration while lazy route
 * chunks are being resolved. Declared here (on the root route) so the
 * router owns it — this is the v7 replacement for RouterProvider's
 * deprecated `fallbackElement` prop.
 */
function HydrateFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-14 h-14 border-3 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
          <Crown className="w-5 h-5 text-amber-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm text-slate-400" style={{ fontFamily: "Acme, sans-serif" }}>
          Loading Mastermind...
        </p>
      </div>
    </div>
  );
}

/**
 * Root layout — providers live in App.tsx; this just outlets child routes.
 */
function RootLayout() {
  return <Outlet />;
}
RootLayout.displayName = "RootLayout";

/**
 * Converts a default-export dynamic import into a React Router v7
 * route-level lazy descriptor. The router wraps the resolution in
 * startTransition internally, eliminating "suspended during synchronous
 * input" errors.
 */
function lazily(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return async () => {
    const { default: Component } = await importFn();
    return { Component };
  };
}

/** Inline 404 thrower — no lazy needed */
function NotFound() {
  throw new Response("Not Found", { status: 404 });
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    // v7 API: render this while lazy chunks are loading on first paint
    HydrateFallback,
    children: [
      // ── Public / unauthenticated routes ────────────────────────────
      {
        path: "/login",
        lazy: lazily(() => import("./pages/Login")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/oauth/callback/:provider",
        lazy: lazily(() => import("./pages/OAuthCallback")),
        errorElement: <RouteErrorBoundary />,
      },

      // ── Public portal routes ────────────────────────────────────────
      {
        path: "/portal/vendor/:vendorId/upload",
        lazy: lazily(() => import("./pages/VendorUploadPortal")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/sign/:contractId",
        lazy: lazily(() => import("./pages/ContractSigningPortal")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/portal/client/:eventId",
        lazy: lazily(() => import("./pages/ClientPortal")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/portal/event/:eventId",
        lazy: lazily(() => import("./pages/EventPortal")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/portal/guest/:eventId",
        lazy: lazily(() => import("./pages/GuestPortal")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/book/:companyId",
        lazy: lazily(() => import("./pages/PublicBooking")),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "/book",
        lazy: lazily(() => import("./pages/PublicBooking")),
        errorElement: <RouteErrorBoundary />,
      },

      // ── Auth-protected dashboard routes ───────────────────────────
      {
        path: "/",
        element: (
          <AuthGuard>
            <DashboardLayout />
          </AuthGuard>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true,             lazy: lazily(() => import("./pages/Dashboard")) },
          { path: "events",          lazy: lazily(() => import("./pages/Events")) },
          { path: "events/:eventId", lazy: lazily(() => import("./pages/Events")) },
          { path: "calendar",        lazy: lazily(() => import("./pages/Calendar")) },
          { path: "crm",             lazy: lazily(() => import("./pages/CRM")) },
          { path: "vendors",         lazy: lazily(() => import("./pages/VendorRoster")) },
          { path: "venues",          lazy: lazily(() => import("./pages/VenueRoster")) },
          { path: "finances",        lazy: lazily(() => import("./pages/Finances")) },
          { path: "financial-consolidation", lazy: lazily(() => import("./pages/FinancialConsolidation")) },
          { path: "reports",         lazy: lazily(() => import("./pages/Reports")) },
          { path: "email",           lazy: lazily(() => import("./pages/EmailCenter")) },
          { path: "email-automation", lazy: lazily(() => import("./pages/EmailAutomation")) },
          { path: "documents",       lazy: lazily(() => import("./pages/Documents")) },
          { path: "tasks",           lazy: lazily(() => import("./pages/TaskManagement")) },
          { path: "admin",           lazy: lazily(() => import("./pages/AdminPanel")) },
          { path: "analytics",       lazy: lazily(() => import("./pages/Analytics")) },
          { path: "marketing",       lazy: lazily(() => import("./pages/Marketing")) },
          { path: "inventory",       lazy: lazily(() => import("./pages/Inventory")) },
          { path: "mobile",          lazy: lazily(() => import("./pages/MobileView")) },
          { path: "api-docs",        lazy: lazily(() => import("./pages/APIDocs")) },
          { path: "workflows",       lazy: lazily(() => import("./pages/Workflows")) },
          { path: "search",          lazy: lazily(() => import("./pages/GlobalSearch")) },
          { path: "white-label",     lazy: lazily(() => import("./pages/WhiteLabel")) },
          { path: "security",        lazy: lazily(() => import("./pages/SecurityCompliance")) },
          { path: "i18n",            lazy: lazily(() => import("./pages/Internationalization")) },
          { path: "integrations",    lazy: lazily(() => import("./pages/IntegrationsHub")) },
          { path: "client-experience", lazy: lazily(() => import("./pages/ClientExperience")) },
          { path: "team-performance", lazy: lazily(() => import("./pages/TeamPerformance")) },
          { path: "data-portability", lazy: lazily(() => import("./pages/DataPortability")) },
          {
            path: "*",
            errorElement: <RouteErrorBoundary />,
            Component: NotFound,
          },
        ],
      },
    ],
  },
]);