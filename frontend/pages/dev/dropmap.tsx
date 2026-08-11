import Head from 'next/head';
import dynamic from 'next/dynamic';

// MapLibre usa WebGL/window → carrega só no client.
const DropMap = dynamic(() => import('../../components/map/DropMap'), { ssr: false });

/**
 * Página de DEMO da Fase 1 do Drop Maps: valida MOTOR (MapLibre) + CARTOGRAFIA
 * (dark Drop) com dados OSM reais. Sem lógica de pedido/rota ainda — só a "sensação".
 * Rota: /dev/dropmap
 */
export default function DevDropMapPage() {
  return (
    <>
      <Head>
        <title>Drop Maps — demo (Fase 1)</title>
      </Head>
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0e' }}>
        <DropMap />

        {/* Marca sobreposta, só pra ambientar a demo */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '10px 14px',
            background: 'rgba(10,10,14,0.6)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            color: '#e7e7ee',
            pointerEvents: 'none',
          }}
        >
          <strong style={{ letterSpacing: '0.08em', fontSize: 14 }}>
            DR<span style={{ color: '#8B5CF6' }}>O</span>P MAPS
          </strong>
          <span style={{ fontSize: 11, color: '#8b8b96' }}>Fase 1 · motor + cartografia</span>
        </div>
      </div>
    </>
  );
}
