import { useLayoutEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { useSaasConfig, loadSaasConfig, __resetSaasConfigCache } from '../useSaasConfig';
import api from '../../lib/api';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

// Resposta síncrona: o cache enche no instante em que alguém chama load(),
// como acontece quando outra instância termina entre o render e o efeito desta.
const syncResponse = (data: any) => {
  const t: any = { then: (cb: any) => { cb({ data }); return t; }, catch: () => t, finally: (cb: any) => { cb(); return t; } };
  return t;
};

function Probe() {
  const { loading, settlementMode, error } = useSaasConfig();
  return <p data-testid="probe">{`${loading ? 'loading' : 'ready'}|${settlementMode}|${error ? 'erro' : 'ok'}`}</p>;
}
// Monta antes do Probe nos efeitos: termina a leitura entre o render e o efeito do Probe.
function Early() {
  useLayoutEffect(() => { loadSaasConfig(); }, []);
  return null;
}

beforeEach(() => { jest.clearAllMocks(); __resetSaasConfigCache(); });

test('instância que monta com a leitura já resolvida sai do carregando com o modo certo', () => {
  (api.get as jest.Mock).mockReturnValue(syncResponse({ settlementMode: 'direto', directCardEnabled: true }));
  render(<><Early /><Probe /></>);
  expect(screen.getByTestId('probe')).toHaveTextContent('ready|direto|ok');
});
