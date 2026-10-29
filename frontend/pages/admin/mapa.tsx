/**
 * Mapa ao vivo (D3b-1, spec 3.4; protótipo tela 5). Permissão operation:view (padrão só CEO).
 * GET /admin/ops/map a cada 15 s (o ritmo do envio de posição do app do motoboy) e no evento admin:order_changed.
 * Mapa em MapLibre (DropMap), o mesmo motor do app. Um ponto por motoboy online com posição: Livre, Em entrega
 * (entrega assigned/picked) ou Sem sinal (posição com mais de 2 min, conferida também aqui entre leituras). Lojas
 * com pedido aguardando viram pino. Tocar no ponto mostra nome, estado e pedido. Se o mapa não carregar, as
 * listas continuam ("Mapa indisponível"). No celular o mapa fica acima das listas.
 * D3b-4b: interruptor "Lojas sem motoboy por perto" (desligado por padrão). Ligado, cada loja de storesWithoutCourier
 * vira um pino de alerta, e a legenda mostra a contagem. O raio do texto é o dispatch.maxKm do servidor.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import mapUi from '../../components/admin/mapa/OpsMap.module.css';
import { OpsMapPanel } from '../../components/admin/mapa/OpsMapPanel';
import type { OpsMapPoint, OpsStorePin } from '../../components/admin/mapa/OpsMarkersLayer';
import ui from '../../components/admin/operacao/Operacao.module.css';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { useAdminOrderChanged } from '../../hooks/useAdminOrderChanged';
import {
  MAP_STATE_LABEL, OPS_MAP_POLL_MS, STAGE_LABEL, ageLabel, fetchOpsMap, kmLabel, motoboyMapState, motoboyOrder,
  opsErrorMessage, orderTag, radiusLabel, type MotoboyMapState, type OpsMapResponse,
} from '../../lib/adminOps';

const STATES: MotoboyMapState[] = ['free', 'delivering', 'stale'];

export default function AdminMapaPage() {
  return (
    <ProtectedRoute required_permission="operation:view">
      <AdminShell title="Mapa ao vivo">
        <MapaAoVivo />
      </AdminShell>
    </ProtectedRoute>
  );
}

function MapaAoVivo() {
  const [data, setData] = useState<OpsMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // D3b-4b: lojas sem motoboy por perto; desligado por padrão.
  const [showNoCourier, setShowNoCourier] = useState(false);
  // Releitura silenciosa que falhou: o mapa fica na tela, com aviso.
  const [staleError, setStaleError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Só a última leitura vale (polling, evento e "Tentar de novo" podem se cruzar).
  const req = useRef(0);
  const hasData = useRef(false);

  /** `silent`: polling e evento relêem sem apagar o mapa (só vale se já há dados). */
  const load = useCallback(async (wantSilent = false) => {
    const silent = wantSilent && hasData.current;
    const n = ++req.current;
    if (!silent) { hasData.current = false; setData(null); }
    setError(null);
    try {
      const d = await fetchOpsMap();
      if (n !== req.current) return;
      hasData.current = true;
      setStaleError(false);
      setData(d);
      setNow(Date.now());
    } catch (err) {
      if (n !== req.current) return;
      if (silent) setStaleError(true);
      else { setStaleError(false); setError(opsErrorMessage(err, 'Não deu para carregar o mapa ao vivo.')); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { void load(true); }, OPS_MAP_POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  // "Sem sinal" também é conferido aqui entre uma leitura e outra.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  useAdminOrderChanged(() => { void load(true); });

  const points: OpsMapPoint[] = useMemo(() => (data ? data.motoboys.map((m) => ({
    id: m.id, name: m.name, lat: m.lat, lng: m.lng, state: motoboyMapState(m, now), detail: motoboyOrder(data, m),
    imprecise: !!m.imprecise,
  })) : []), [data, now]);
  const pins: OpsStorePin[] = useMemo(() => (data ? data.waiting
    .filter((w) => w.storeLat !== null && w.storeLng !== null)
    .map((w) => ({ id: w.orderId, name: w.storeName, lat: w.storeLat as number, lng: w.storeLng as number })) : []), [data]);
  // Id próprio: o pino do pedido aguardando usa o id do pedido, e os dois nunca colidem.
  const noCourierPins: OpsStorePin[] = useMemo(() => (data ? data.storesWithoutCourier
    .map((s) => ({ id: `sem-motoboy:${s.id}`, name: s.name, lat: s.lat, lng: s.lng, kind: 'noCourier' as const })) : []), [data]);
  const storePins = useMemo(() => (showNoCourier ? [...pins, ...noCourierPins] : pins), [showNoCourier, pins, noCourierPins]);

  if (error) return <LoadError message={error} onRetry={() => { void load(); }} />;
  if (!data) return <LoadSkeleton lines={6} />;

  const counts: Record<MotoboyMapState, number> = { free: 0, delivering: 0, stale: 0 };
  points.forEach((p) => { counts[p.state] += 1; });
  const imprecise = points.filter((p) => p.imprecise).length;
  const picked = points.find((p) => p.id === selected) ?? null;

  return (
    <div className={ui.stack}>
      {staleError && (
        <p role="status" className={ui.live}>
          Não deu para atualizar. Mostrando a última leitura.{' '}
          <Button variant="secondary" className={ui.touch} onClick={() => { void load(true); }}>Tentar de novo</Button>
        </p>
      )}
      <div className={mapUi.head}>
        <h2 className={blocks.blockTitle}>{`Ao vivo · ${data.motoboys.length} online`}</h2>
        <ul className={mapUi.legend} aria-label="Legenda">
          {STATES.map((s) => (
            <li key={s}>
              <span className={`${mapUi.dot} ${mapUi[s]}`} aria-hidden="true" />
              {`${MAP_STATE_LABEL[s]} · ${counts[s]}`}
            </li>
          ))}
          {imprecise > 0 && (
            <li>
              <span className={`${mapUi.dot} ${mapUi.impreciseDot}`} aria-hidden="true" />
              {`GPS impreciso · ${imprecise}`}
            </li>
          )}
          {showNoCourier && (
            <li>
              <span className={`${mapUi.dot} ${mapUi.noCourier}`} aria-hidden="true" />
              {`Sem motoboy por perto · ${data.storesWithoutCourier.length}`}
            </li>
          )}
        </ul>
      </div>

      {data.motoboys.length === 0 && <Alert tone="warning" title="Nenhum motoboy online agora" />}

      <div className={mapUi.layout}>
        <section className={mapUi.mapCol} aria-label="Mapa">
          <Switch
            label="Lojas sem motoboy por perto"
            description={`Abertas agora, sem ninguém online a até ${kmLabel(data.dispatch.maxKm)}`}
            checked={showNoCourier}
            onChange={setShowNoCourier}
          />
          <OpsMapPanel motoboys={points} stores={storePins} onSelect={setSelected} />
          {picked && (
            <div className={mapUi.selected} role="status" aria-label="Motoboy selecionado">
              <span>{`${picked.name} · ${MAP_STATE_LABEL[picked.state]} · ${picked.detail ?? 'sem pedido agora'}`}</span>
              {picked.imprecise && <StatusTag tone="warn">GPS impreciso: não recebe corrida nova</StatusTag>}
              <Button variant="tertiary" size="sm" onClick={() => setSelected(null)}>Fechar</Button>
            </div>
          )}
        </section>

        <div className={ui.side}>
          <section className={blocks.block} aria-label="Aguardando motoboy">
            <div className={blocks.blockHead}>
              <h2 className={blocks.blockTitle}>{`Aguardando motoboy · ${data.waiting.length}`}</h2>
            </div>
            {data.waiting.length === 0 ? (
              <EmptyNote text="Nenhum pedido esperando motoboy" />
            ) : (
              <ul className={mapUi.list}>
                {data.waiting.map((w) => (
                  <li key={w.orderId} className={mapUi.item}>
                    <Link href={`/admin/pedidos/${w.orderId}`} className={mapUi.link}>{`${orderTag(w.shortId)} · ${w.storeName}`}</Link>
                    <span className={mapUi.itemMeta}>
                      <span>{ageLabel(w.since, now)}</span>
                      <span>{radiusLabel(w.radiusKm)}</span>
                      {w.customerDeciding && <StatusTag tone="warn">Cliente decidindo</StatusTag>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={blocks.block} aria-label="Em entrega">
            <div className={blocks.blockHead}>
              <h2 className={blocks.blockTitle}>{`Em entrega · ${data.inDelivery.length}`}</h2>
            </div>
            {data.inDelivery.length === 0 ? (
              <EmptyNote text="Ninguém em entrega agora" />
            ) : (
              <ul className={mapUi.list}>
                {data.inDelivery.map((d) => (
                  <li key={d.orderId} className={mapUi.item}>
                    <Link href={`/admin/pedidos/${d.orderId}`} className={mapUi.link}>{`${d.motoboyName} · ${orderTag(d.shortId)}`}</Link>
                    <span className={mapUi.itemMeta}>{STAGE_LABEL[d.stage] ?? d.stage}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={blocks.block} aria-label="Despacho">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Despacho</h2></div>
            <dl className={ui.facts}>
              <div><dt>Raio inicial</dt><dd>{kmLabel(data.dispatch.initialKm)}</dd></div>
              <div><dt>Aumenta</dt><dd>{`${kmLabel(data.dispatch.stepKm)} a cada ${data.dispatch.stepSeconds} s`}</dd></div>
              <div><dt>Teto</dt><dd>{kmLabel(data.dispatch.maxKm)}</dd></div>
              <div><dt>Sem motoboy depois de</dt><dd>{`${data.dispatch.poolTimeoutMin} min`}</dd></div>
            </dl>
            <p className={blocks.muted}>Só leitura: vem da configuração do servidor.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
