import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        return status !== 401 && failureCount < 2;
      },
      staleTime: 2_000,
    },
  },
});
