/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse de l'API Laravel, sans slash final. Défaut : http://127.0.0.1:8000/api */
  readonly VITE_API_URL?: string;
}
