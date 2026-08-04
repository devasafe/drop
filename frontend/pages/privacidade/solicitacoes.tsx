import LegalPage, { LegalSection } from '../../components/legal/LegalPage';
import { LEGAL_VERSIONS, LEGAL_UPDATED, PRIVACY_EMAIL } from '../../lib/legalDocs';

export default function SolicitacoesPrivacidadePage() {
  return (
    <LegalPage
      title="Canal de Direitos do Titular"
      version={LEGAL_VERSIONS.privacy}
      updatedAt={LEGAL_UPDATED}
    >
      <LegalSection title="1. Sobre este canal">
        <p>
          A Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018) garante a
          qualquer titular de dados pessoais o direito de solicitar, junto ao controlador,
          informações e providências sobre o tratamento feito com seus dados. Esta página
          explica quais são esses direitos e como exercê-los junto à DROP.
        </p>
        <p>
          Para o detalhamento completo de quais dados a DROP trata, com que finalidade e com
          quem são compartilhados, consulte a nossa{' '}
          <a href="/privacidade">Política de Privacidade</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Direitos garantidos pela LGPD">
        <p>
          Nos termos do artigo 18 da LGPD, o titular de dados pessoais tem direito a
          solicitar, a qualquer momento e mediante requisição:
        </p>
        <ul>
          <li>
            <strong>Confirmação da existência de tratamento:</strong> saber se a DROP trata
            ou não dados pessoais seus.
          </li>
          <li>
            <strong>Acesso aos dados:</strong> obter uma cópia dos dados pessoais tratados
            pela DROP a seu respeito.
          </li>
          <li>
            <strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou
            desatualizados.
          </li>
          <li>
            <strong>Anonimização, bloqueio ou eliminação:</strong> requerer a anonimização,
            o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em
            desconformidade com a LGPD.
          </li>
          <li>
            <strong>Portabilidade:</strong> solicitar a portabilidade dos dados a outro
            fornecedor de serviço ou produto, mediante requisição expressa, observados os
            segredos comercial e industrial da DROP.
          </li>
          <li>
            <strong>Eliminação dos dados tratados com consentimento:</strong> pedir a
            eliminação dos dados pessoais tratados com base no consentimento do titular,
            ressalvadas as hipóteses de conservação previstas em lei (por exemplo, obrigações
            fiscais e regulatórias).
          </li>
          <li>
            <strong>Informação sobre compartilhamento:</strong> obter informação sobre as
            entidades públicas e privadas com as quais a DROP compartilhou seus dados.
          </li>
          <li>
            <strong>Revogação do consentimento:</strong> revogar, a qualquer momento, o
            consentimento eventualmente dado, por procedimento gratuito e facilitado, sem
            prejuízo dos tratamentos já realizados sob outras bases legais (como execução de
            contrato ou obrigação legal).
          </li>
        </ul>
        <p>
          A revogação do consentimento ou a eliminação de determinados dados pode implicar a
          impossibilidade de continuar utilizando funcionalidades da Plataforma que dependam
          desses dados (por exemplo, dados de verificação de identidade necessários para
          concluir pedidos ou receber pagamentos).
        </p>
      </LegalSection>

      <LegalSection title="3. Como exercer seus direitos">
        <p>
          Para exercer qualquer um dos direitos listados acima, escreva para{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>, informando:
        </p>
        <ul>
          <li>O direito que deseja exercer;</li>
          <li>Seu nome completo e o e-mail cadastrado na DROP;</li>
          <li>Uma descrição clara da solicitação (por exemplo, quais dados deseja acessar, corrigir ou eliminar).</li>
        </ul>
        <p>
          Para proteger sua conta e evitar solicitações fraudulentas em nome de terceiros,
          podemos solicitar informações adicionais para <strong>confirmar a sua
          identidade</strong> antes de atender ao pedido.
        </p>
        <p>
          Hoje esse canal é atendido por e-mail; um formulário automatizado dentro da
          Plataforma está previsto como evolução futura.
        </p>
      </LegalSection>

      <LegalSection title="4. Prazo de resposta">
        <p>
          Envidamos esforços para responder às solicitações dentro de um prazo razoável,
          em regra em até <strong>15 (quinze) dias</strong> a contar da confirmação de
          identidade do titular, prorrogável quando a complexidade da solicitação exigir,
          mediante comunicação ao solicitante dos motivos da prorrogação.
        </p>
        <p>
          Caso a solicitação não possa ser atendida integralmente (por exemplo, por haver
          base legal que justifique a manutenção de determinado dado), a resposta explicará
          os motivos, ainda que de forma resumida.
        </p>
      </LegalSection>

      <LegalSection title="5. Outros canais">
        <p>
          Dúvidas gerais sobre o tratamento de dados pessoais pela DROP, incluindo sobre o
          Encarregado (DPO) responsável, também podem ser enviadas para{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
        <p>
          Caso o titular entenda que sua solicitação não foi devidamente atendida, pode
          também procurar a Autoridade Nacional de Proteção de Dados (ANPD) para apresentar
          reclamação, nos termos da LGPD.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
