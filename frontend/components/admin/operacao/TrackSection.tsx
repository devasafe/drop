import { useState } from 'react';
import blocks from '../AdminBlocks.module.css';
import ui from './Operacao.module.css';
import styles from './TrackSection.module.css';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { spTime } from '../../../lib/adminMoney';
import { fetchOrderTrack, opsErrorMessage, trackCsv, type RideTrack } from '../../../lib/adminOps';

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/**
 * Antifraude · caminho do motoboy em cada corrida do pedido (pontos gravados a cada ~5 s).
 * Carrega só quando o admin pede. O CSV serve de prova em contestação e boletim de ocorrência.
 */
export function TrackSection({ orderId }: { orderId: string }) {
  const [rides, setRides] = useState<RideTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRides(await fetchOrderTrack(orderId));
    } catch (err) {
      setError(opsErrorMessage(err, 'Confira a conexão e tente de novo.'));
    } finally {
      setLoading(false);
    }
  };

  const download = (ride: RideTrack) => {
    const url = URL.createObjectURL(new Blob([trackCsv(ride)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `caminho-${ride.deliveryId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={blocks.block} aria-label="Caminho do motoboy">
      <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Caminho do motoboy</h2></div>
      {error && <Alert tone="error" title="Não carregamos o caminho">{error}</Alert>}
      {rides === null ? (
        <Button variant="secondary" className={ui.touch} onClick={load} loading={loading}>Ver caminho</Button>
      ) : rides.length === 0 ? (
        <p className={blocks.muted}>Este pedido ainda não teve corrida.</p>
      ) : (
        rides.map((r) => {
          const first = r.points[0];
          const last = r.points[r.points.length - 1];
          return (
            <div key={r.deliveryId} className={styles.ride}>
              {r.signalLostAt && (
                <Alert tone="error" title="Sinal perdido">{`A posição parou de chegar às ${spTime(r.signalLostAt)}.`}</Alert>
              )}
              {r.simulatedCount > 0 && (
                <Alert tone="warning" title="GPS falso">{`O celular acusou localização falsa em ${r.simulatedCount} das posições.`}</Alert>
              )}
              <dl className={ui.facts}>
                <div><dt>Corrida</dt><dd>{r.kind === 'devolucao' ? 'Devolução' : 'Entrega'}</dd></div>
                <div><dt>Motoboy</dt><dd>{r.motoboy?.name ?? '—'}</dd></div>
                <div><dt>Posições</dt><dd>{r.points.length}</dd></div>
                {first && last && <div><dt>De / até</dt><dd>{`${spTime(first.at)} → ${spTime(last.at)}`}</dd></div>}
              </dl>
              {last ? (
                <div className={styles.actions}>
                  <a className={styles.link} href={mapsLink(last.lat, last.lng)} target="_blank" rel="noreferrer">Última posição no mapa</a>
                  <Button variant="tertiary" size="sm" onClick={() => download(r)}>Baixar caminho (CSV)</Button>
                </div>
              ) : (
                <p className={blocks.muted}>Nenhuma posição recebida nesta corrida.</p>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
