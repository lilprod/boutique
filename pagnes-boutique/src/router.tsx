import React, { useEffect, useState } from 'react';

const read = () => (location.hash.slice(1) || '/').split('?')[0];

/** Routeur minimal par hash (#/stock) : fonctionne hors ligne et sans configuration serveur. */
export function useRoute() {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const f = () => setPath(read());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return path;
}
export const go = (to: string) => { location.hash = to; };

export function Link({ to, className, children, title }: { to: string; className?: string; children: React.ReactNode; title?: string }) {
  return <a href={'#' + to} className={className} title={title}>{children}</a>;
}
