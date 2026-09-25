import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get } from '../api';

/** Lit une ressource de l'API à l'ouverture de l'écran. Une réponse tardive d'une requête périmée est ignorée. */
export function useFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await get<T>(path);
      if (id === seq.current) setData(r);
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { void reload(); return () => { seq.current++; }; }, [reload]);
  return { data, error, loading, reload };
}
