import { QueryClient } from "@tanstack/react-query";

// Module-level singleton shared by the app root (QueryClientProvider) and any
// module that must invalidate queries outside a React context — notably the
// claude2 message adapter, whose useClaude2Session hook is also exercised in
// renderHook tests without a QueryClientProvider wrapper. Importing the same
// instance avoids useQueryClient's Provider dependency in those code paths.
export const queryClient = new QueryClient();
