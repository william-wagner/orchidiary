import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
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
  const navigate = useNavigate();
  return async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // O `useMe` observa a query "me": um `qc.clear()` a removeria do cache e o App
      // nunca veria o `null`. Então marcamos a sessão como encerrada e limpamos o resto.
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      // O próximo login começa na coleção, não na página de onde a pessoa saiu.
      navigate("/", { replace: true });
    }
  };
}
