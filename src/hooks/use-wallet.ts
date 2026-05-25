import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { fetchWallet } from "@/lib/wallet-api";

export function walletQueryKey(userId: string | null | undefined) {
  return ["wallet", userId] as const;
}

export function useWallet() {
  const { userId, isLoaded, isSignedIn } = useAuth();

  return useQuery({
    queryKey: walletQueryKey(userId),
    queryFn: () => fetchWallet(),
    enabled: Boolean(isLoaded && isSignedIn && userId),
    staleTime: 30_000,
  });
}
