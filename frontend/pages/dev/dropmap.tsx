import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// MapLibre usa WebGL/window → carrega só no client.
const DropMap = dynamic(() => import('../../components/map/DropMap'), { ssr: false });

/**
 * DEMO da Fase 1 do Drop Maps: MOTOR (MapLibre) + CARTOGRAFIA (dark Drop) com OSM real.
 * Rota: /dev/dropmap
 *
 * ⚠️ Renderizado via PORTAL pro document.body: o `_app` embrulha as páginas no
 * `PageTransition`, que usa transform/filter — isso quebra position:fixed E o
 * compositing do canvas WebGL (mapa fica preto). O portal escapa desse contexto.
 */
export default function DevDropMapPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overlay = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0a0a0e' }}>
      <DropMap />
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
  );

  return (
    <>
      <Head>
        <title>Drop Maps — demo (Fase 1)</title>
      </Head>
      {mounted ? createPortal(overlay, document.body) : null}
    </>
  );
}
