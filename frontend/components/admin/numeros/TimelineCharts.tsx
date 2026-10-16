import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { OrdersTimelinePoint, UserGrowthPoint } from '../../../lib/analyticsApi';
import { brl, num } from '../../../lib/adminNumeros';
import styles from './Numeros.module.css';

const day = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const GROWTH_SERIES = [
  { key: 'clientes', label: 'Clientes', className: styles.serieClientes },
  { key: 'lojistas', label: 'Lojistas', className: styles.serieLojistas },
  { key: 'motoboys', label: 'Motoboys', className: styles.serieMotoboys },
] as const;

/** Cadastros novos por dia, por tipo (3 séries; legenda sempre visível). */
export function UserGrowthChart({ points }: { points: UserGrowthPoint[] }) {
  return (
    <>
      <ul className={styles.legend} aria-label="Legenda">
        {GROWTH_SERIES.map((s) => (
          <li key={s.key} className={styles.legendItem}>
            <span className={`${styles.dot} ${s.className}`} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} className={styles.grid} />
            <XAxis dataKey="date" tickFormatter={day} fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} width={36} />
            <Tooltip labelFormatter={(l) => day(String(l))} formatter={(v) => num(Number(v))} />
            {GROWTH_SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke="currentColor"
                strokeWidth={2} dot={false} className={s.className} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Pedidos por dia e vendido por dia: dois gráficos de um eixo (o antigo tinha dois eixos num gráfico só). */
export function OrdersCharts({ points }: { points: OrdersTimelinePoint[] }) {
  return (
    <div className={styles.charts}>
      <figure className={styles.figure}>
        <figcaption className={styles.figcaption}>Pedidos por dia</figcaption>
        <div className={styles.chartSmall}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} className={styles.grid} />
              <XAxis dataKey="date" tickFormatter={day} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={36} />
              <Tooltip labelFormatter={(l) => day(String(l))} formatter={(v) => num(Number(v))} />
              <Bar dataKey="orders" name="Pedidos" fill="currentColor" radius={[4, 4, 0, 0]} className={styles.serieOrders} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className={styles.figure}>
        <figcaption className={styles.figcaption}>Vendido por dia</figcaption>
        <div className={styles.chartSmall}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} className={styles.grid} />
              <XAxis dataKey="date" tickFormatter={day} fontSize={11} />
              <YAxis fontSize={11} width={56} tickFormatter={(v) => num(Number(v))} />
              <Tooltip labelFormatter={(l) => day(String(l))} formatter={(v) => brl(Number(v))} />
              <Line type="monotone" dataKey="gmv" name="Vendido" stroke="currentColor" strokeWidth={2} dot={false}
                className={styles.serieGmv} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
