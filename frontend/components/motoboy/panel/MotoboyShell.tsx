import { PanelShell, type PanelShellProps } from '../../panel/PanelShell';
import { motoboyShowsTabBar } from '../../../lib/motoboyRoutes';

export type MotoboyShellProps = Omit<PanelShellProps, 'showsTabBar'>;

/** Casca das telas do painel do motoboy (D2): a `PanelShell` com a barra de 4 abas (e Entregas). */
export function MotoboyShell(props: MotoboyShellProps) {
  return <PanelShell {...props} showsTabBar={motoboyShowsTabBar} />;
}

export default MotoboyShell;
