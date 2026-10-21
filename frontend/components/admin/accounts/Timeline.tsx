/**
 * Linha do tempo da ficha (D3b-2a, spec 5.1 e 7): ações da equipe e notas internas, na ordem do servidor (a mais
 * nova primeiro), com autor e data. O campo de nota fica no topo e só aparece com `canWrite` (quem vê a ficha
 * escreve). Nota não se edita nem se apaga. "Carregar mais" só aparece com `onLoadMore` (o servidor mandou cursor).
 */
import { useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import blocks from '../AdminBlocks.module.css';
import { TextAreaField } from '../dinheiro/TextAreaField';
import { spDateTime } from '../../../lib/adminMoney';
import {
  NOTE_MAX, accountErrorMessage, actionLabel, noteIsValid, timelineActor, timelineDetail, type TimelineItem,
} from '../../../lib/adminAccounts';
import ui from './Accounts.module.css';

export interface TimelineProps {
  items: TimelineItem[];
  /** Próxima página; erro vira aviso com "Tentar de novo". */
  onLoadMore?: () => Promise<void>;
  canWrite: boolean;
  /** Grava a nota (texto já aparado). Resolveu: o campo esvazia. Erro: aparece embaixo do campo. */
  onWriteNote: (text: string) => Promise<void>;
}

export function Timeline({ items, onLoadMore, canWrite, onWriteNote }: TimelineProps) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Trava síncrona: dois cliques no mesmo tick gravariam duas notas.
  const sendingRef = useRef(false);
  const moreRef = useRef(false);

  const send = async () => {
    const text = note.trim();
    if (sendingRef.current || !noteIsValid(text)) return;
    sendingRef.current = true;
    setSending(true);
    setNoteError(null);
    try {
      await onWriteNote(text);
      setNote('');
    } catch (err) {
      setNoteError(accountErrorMessage(err, 'Não deu para salvar a nota.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const more = async () => {
    if (!onLoadMore || moreRef.current) return;
    moreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      await onLoadMore();
    } catch (err) {
      setMoreError(accountErrorMessage(err, 'Não deu para carregar mais.'));
    } finally {
      moreRef.current = false;
      setLoadingMore(false);
    }
  };

  return (
    <div className={ui.timeline}>
      {canWrite && (
        <div className={ui.noteBox}>
          <TextAreaField
            label="Nota interna"
            value={note}
            onChange={(v) => { setNote(v); setNoteError(null); }}
            placeholder="O que a equipe precisa saber sobre esta conta"
            hint={`Só a equipe vê. Não dá para editar nem apagar depois. Até ${NOTE_MAX} caracteres.`}
            disabled={sending}
          />
          {noteError && <p role="alert" className={blocks.errText}>{noteError}</p>}
          <div className={ui.noteActions}>
            <Button
              variant="secondary"
              className={ui.touch}
              loading={sending}
              disabled={!noteIsValid(note)}
              onClick={() => { void send(); }}
            >
              Salvar nota
            </Button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <p className={blocks.muted}>Nada no histórico ainda.</p>
      ) : (
        <ol className={ui.tlList} aria-label="Histórico">
          {items.map((it) => {
            const detail = timelineDetail(it);
            return (
              <li key={it.id} className={it.type === 'note' ? `${ui.tlItem} ${ui.tlNote}` : ui.tlItem} data-type={it.type}>
                <div className={ui.tlHead}>
                  <span className={ui.tlLabel}>{actionLabel(it.type)}</span>
                  <time className={ui.tlTime} dateTime={it.createdAt}>{spDateTime(it.createdAt)}</time>
                </div>
                <span className={ui.tlActor}>{timelineActor(it.actor)}</span>
                {it.reason && <p className={ui.tlText}>{it.reason}</p>}
                {detail && <p className={ui.tlText}>{detail}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
      {onLoadMore && (
        <div className={ui.loadMore}>
          <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void more(); }}>
            {moreError ? 'Tentar de novo' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default Timeline;
