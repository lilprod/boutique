import React, { useState } from 'react';
import { LuPrinter } from 'react-icons/lu';
import type { Vente } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { doPrint, Modal, PrintRoot, Segmented } from './ui';
import { Ticket } from './Ticket';

/** `lead` : contenu facultatif affiché au-dessus de l'aperçu (ex. confirmation animée après une vente). */
export function TicketModal({ vente, title, onClose, children, lead }: { vente: Vente; title: string; onClose: () => void; children?: React.ReactNode; lead?: React.ReactNode }) {
  const { db } = useApp();
  const [fmt, setFmt] = useState<'80mm' | 'A4'>(db.parametres.ticketFormat);
  return (
    <Modal title={title} onClose={onClose} size={fmt === 'A4' ? 'lg' : 'md'}
      footer={<>
        <Segmented label={t('ticket.format')} value={fmt} onChange={setFmt} options={[{ v: '80mm', label: t('ticket.thermique') }, { v: 'A4', label: 'A4' }]} />
        <span className="grow" />
        {children}
        <button className="btn btn-primary" onClick={() => doPrint(fmt)}><LuPrinter /> {t('ticket.imprimer')}</button>
      </>}>
      {lead}
      <div className="ticket-preview"><Ticket vente={vente} format={fmt} /></div>
      <PrintRoot><Ticket vente={vente} format={fmt} /></PrintRoot>
    </Modal>
  );
}
