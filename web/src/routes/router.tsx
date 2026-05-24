import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AuthGate } from "./AuthGate";
import { HomeRoute } from "./HomeRoute";
import { ProjectConsoleRoute } from "./ProjectConsoleRoute";

const rootRoute = createRootRoute({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const projectConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName",
  component: ProjectConsoleRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, projectConsoleRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
