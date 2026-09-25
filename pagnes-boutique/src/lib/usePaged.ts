import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get } from '../api';

interface Page { data: any[]; current_page: number; last_page: number; total: number }

/**
 * Lit une liste paginée de l'API (Laravel) à la demande : première page à l'ouverture et à chaque changement
 * de filtre, pages suivantes avec `more()`. Une réponse tardive d'un filtre périmé est ignorée.
 * `map` doit être stable (fonction de module) ; `params` : les valeurs vides sont omises.
 */
export function usePaged<T>(path: string, params: Record<string, string | undefined>, map: (raw: any) => T, opts: { enabled?: boolean; perPage?: number } = {}) {
  const { enabled = true, perPage = 50 } = opts;
  const [rows, setRows] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [last, setLast] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(params);

  const fetchPage = useCallback(async (n: number) => {
    const id = ++seq.current;
    const qs = new URLSearchParams();
    Object.entries(JSON.parse(key) as Record<string, string | undefined>).forEach(([k, v]) => { if (v) qs.set(k, v); });
    qs.set('per_page', String(perPage)); qs.set('page', String(n));
    setLoading(true); setError(null);
    try {
      const r = await get<Page>(`${path}?${qs}`);
      if (id !== seq.current) return;
      setRows(prev => (n === 1 ? r.data.map(map) : [...prev, ...r.data.map(map)]));
      setPage(r.current_page); setLast(r.last_page); setTotal(r.total);
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path, key, perPage, map]);

  useEffect(() => { if (enabled) void fetchPage(1); }, [enabled, fetchPage]);

  return { rows, total, loading, error, hasMore: page < last, more: () => fetchPage(page + 1), reload: () => fetchPage(1) };
}

/** Valeur retardée : évite une requête à chaque frappe dans un champ de recherche. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return v;
}
