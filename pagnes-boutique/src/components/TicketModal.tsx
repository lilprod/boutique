import React, { useState } from 'react';
import { LuPrinter } from 'react-icons/lu';
import type { Vente } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { doPrint, Modal, PrintRoot, Segmented } from './ui';
import { Ticket } from './Ticket';

export function TicketModal({ vente, title, onClose, children }: { vente: Vente; title: string; onClose: () => void; children?: React.ReactNode }) {
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
      <div className="ticket-preview"><Ticket vente={vente} format={fmt} /></div>
      <PrintRoot><Ticket vente={vente} format={fmt} /></PrintRoot>
    </Modal>
  );
}
