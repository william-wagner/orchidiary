import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type User } from "./api.ts";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<User>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // Não usar qc.clear(): ele descarta a query ["me"] que o App observa e a tela não volta ao login.
      // Atualiza "me" no lugar e remove só o resto do cache (dados do usuário que saiu).
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    }
  };
}
