/**
 * Client HTTP de l'API Laravel (pagnes-api) : jeton Bearer, erreurs normalisées, chargement paginé.
 * Configurer l'adresse avec VITE_API_URL (voir .env.example) ; par défaut, l'API locale.
 */
const BASE = ((import.meta.env?.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'pagnes.token';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const token = {
  get(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v: string | null) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ } },
};

/** Appelée quand le serveur répond 401 sur une requête authentifiée (jeton expiré, compte désactivé). */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

/** Message lisible : `message` du serveur (422 métier), sinon première erreur de validation, sinon un texte générique. */
function messageOf(status: number, body: any): string {
  const first = body?.errors && Object.values<string[]>(body.errors)[0]?.[0];
  if (status === 422 && first) return first;
  if (body?.message && typeof body.message === 'string') return body.message;
  if (status === 403) return "Cette action est réservée à l'administrateur.";
  if (status === 429) return 'Trop de tentatives. Réessayez dans une minute.';
  if (status >= 500) return 'Erreur du serveur. Réessayez.';
  return `Erreur ${status}.`;
}

export async function request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const tk = token.get();
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez la connexion.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && tk && path !== '/login') onUnauthorized();
    throw new ApiError(messageOf(res.status, data), res.status);
  }
  return data as T;
}

export const get = <T = any>(path: string) => request<T>('GET', path);
export const post = <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
export const put = <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {});
export const del = <T = any>(path: string) => request<T>('DELETE', path);

/** Charge toutes les pages d'une liste paginée Laravel (200 par page, plafond de sécurité de 50 pages). */
export async function getAll<T = any>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await get<{ data: T[]; last_page: number }>(`${path}${sep}per_page=200&page=${page}`);
    out.push(...r.data);
    if (page >= r.last_page) break;
  }
  return out;
}
