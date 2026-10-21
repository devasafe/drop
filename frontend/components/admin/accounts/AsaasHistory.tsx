/**
 * "Conta Asaas · histórico" (D3b-2b, spec 9; ruling 11): só o CEO recebe. Mostra o último aceite do termo (versão,
 * data, IP e quem aceitou) e as alterações da conta Asaas própria da loja (conectar, trocar a chave, desconectar),
 * com os 4 últimos dígitos da chave, o autor e a data.
 */
import blocks from '../AdminBlocks.module.css';
import ui from './Accounts.module.css';
import { asaasAuditLabel, consentText, spDate, type StoreAsaasHistory } from '../../../lib/adminAccounts';
import { spTime } from '../../../lib/adminMoney';

export function AsaasHistory({ history }: { history: StoreAsaasHistory }) {
  return (
    <section className={blocks.block} aria-label="Conta Asaas · histórico">
      <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Conta Asaas · histórico</h2></div>
      <p className={blocks.muted}>
        {history.consent ? consentText(history.consent) : 'Termo de uso da conta Asaas ainda não aceito.'}
      </p>
      {history.audits.length === 0 ? (
        <p className={blocks.muted}>Nenhuma alteração na conta Asaas.</p>
      ) : (
        <ul className={ui.lines}>
          {history.audits.map((a, i) => (
            <li key={`${a.createdAt}-${i}`} className={ui.line}>
              <div className={ui.lineMain}>
                <span className={ui.lineTitle}>
                  {`${asaasAuditLabel(a.action)}${a.apiKeyLast4 ? ` · chave ••••${a.apiKeyLast4}` : ''}`}
                </span>
                <span className={ui.sub}>
                  {`${a.actor.name ?? 'Pessoa removida'} · ${spDate(a.createdAt)} às ${spTime(a.createdAt)}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default AsaasHistory;
