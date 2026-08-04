import LegalPage, { LegalSection } from '../components/legal/LegalPage';
import { LEGAL_VERSIONS, LEGAL_UPDATED, PRIVACY_EMAIL } from '../lib/legalDocs';
import styles from '../components/legal/LegalPage.module.css';

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" version={LEGAL_VERSIONS.privacy} updatedAt={LEGAL_UPDATED}>
      <LegalSection title="1. Controlador e Encarregado de Dados">
        <p>
          Esta Política de Privacidade descreve como{' '}
          <span className={styles.placeholder}>[RAZÃO SOCIAL]</span>, inscrita no CNPJ sob o
          nº <span className={styles.placeholder}>[CNPJ]</span>, com sede em{' '}
          <span className={styles.placeholder}>[ENDEREÇO DA EMPRESA]</span> ("DROP", "nós"),
          na qualidade de <strong>controladora</strong> de dados pessoais, coleta, utiliza,
          armazena e compartilha os dados pessoais de clientes, lojistas e motoboys que
          utilizam a Plataforma, em conformidade com a Lei nº 13.709/2018 (Lei Geral de
          Proteção de Dados Pessoais — "LGPD").
        </p>
        <p>
          O Encarregado pelo tratamento de dados pessoais (DPO) da DROP é{' '}
          <span className={styles.placeholder}>[NOME DO ENCARREGADO]</span>, que pode ser
          contatado por meio do e-mail{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> para esclarecer dúvidas,
          receber solicitações ou reclamações relacionadas ao tratamento de dados pessoais
          nesta Política.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que tratamos, por perfil de usuário">
        <p>
          Coletamos diferentes categorias de dados pessoais conforme o perfil do usuário
          (cliente, lojista ou motoboy) e a forma como utiliza a Plataforma:
        </p>
        <ul>
          <li>
            <strong>Cadastro (todos os perfis):</strong> nome completo, e-mail, senha
            (armazenada de forma criptografada), telefone, gênero e data de nascimento.
          </li>
          <li>
            <strong>Localização:</strong> endereço, número, bairro, cidade, CEP e coordenadas
            de latitude/longitude, utilizados para entrega, busca de lojas próximas e cálculo
            de rotas.
          </li>
          <li>
            <strong>Dados sensíveis e de verificação (KYC):</strong> CPF, RG, foto e selfie
            facial para confirmação biométrica de identidade; adicionalmente, para{' '}
            <strong>motoboys</strong>, CNH e placa do veículo; para <strong>lojistas</strong>,
            CNPJ e comprovante de endereço.
          </li>
          <li>
            <strong>Dados financeiros:</strong> dados bancários e/ou chave PIX para
            recebimento de repasses, histórico de transações, repasses e solicitações de
            saque.
          </li>
          <li>
            <strong>Dados de uso da Plataforma:</strong> histórico de pedidos, avaliações de
            produtos e lojas, mensagens trocadas em chat, notificações recebidas e dados de
            gamificação (pontos, níveis, conquistas).
          </li>
          <li>
            <strong>Dados técnicos:</strong> logs de acesso, endereço IP, informações de
            navegador/dispositivo (user-agent) e registros do consentimento manifestado aos
            documentos legais da Plataforma.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalidades e bases legais do tratamento">
        <p>
          Tratamos dados pessoais para as finalidades abaixo, com fundamento nas seguintes
          bases legais previstas nos artigos 7º e 11 da LGPD:
        </p>
        <ul>
          <li>
            <strong>Execução de contrato:</strong> criação e gestão de conta, processamento de
            pedidos, pagamentos, custódia de valores e organização de entregas — dados
            necessários para prestar o serviço contratado pelo usuário.
          </li>
          <li>
            <strong>Cumprimento de obrigação legal ou regulatória:</strong> verificação de
            identidade (KYC), prevenção à fraude e lavagem de dinheiro, e guarda de registros
            fiscais e contábeis exigidos por lei.
          </li>
          <li>
            <strong>Consentimento:</strong> envio de comunicações de marketing (quando
            houver) e tratamento de dados sensíveis de verificação (como a selfie facial),
            nos casos em que a base legal aplicável exigir consentimento específico e
            destacado do titular.
          </li>
          <li>
            <strong>Legítimo interesse:</strong> segurança da Plataforma, prevenção a fraudes,
            melhoria contínua dos produtos e serviços oferecidos, sempre respeitados os
            direitos e expectativas legítimas dos titulares.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Compartilhamento de dados com operadores">
        <p>
          Para viabilizar o funcionamento da Plataforma, compartilhamos dados pessoais com
          operadores (subprocessadores) que tratam dados em nosso nome e sob nossas
          instruções, nas finalidades abaixo:
        </p>
        <ul>
          <li>
            <strong>Asaas</strong> (Brasil): processamento de pagamentos, custódia de valores,
            verificação de identidade (KYC) de subcontas e transferências via PIX.
          </li>
          <li>
            <strong>Cloudinary</strong> (Estados Unidos): armazenamento de imagens e
            documentos, incluindo os documentos enviados no processo de verificação de
            identidade (KYC).
          </li>
          <li>
            <strong>Brevo</strong> (União Europeia — França): envio de e-mails transacionais
            (confirmações, notificações, recuperação de senha, entre outros).
          </li>
          <li>
            <strong>Google Maps Platform</strong> (Estados Unidos): geolocalização, cálculo e
            exibição de rotas para entregas.
          </li>
          <li>
            <strong>Provedor de hospedagem</strong> (Brasil): armazenamento do banco de dados
            e infraestrutura de execução da Plataforma.
          </li>
        </ul>
        <p>
          Também podemos compartilhar dados pessoais com autoridades públicas, quando
          exigido por lei, ordem judicial ou requisição de autoridade competente.
        </p>
      </LegalSection>

      <LegalSection title="5. Transferência internacional de dados">
        <p>
          O banco de dados principal da DROP é hospedado no <strong>Brasil</strong>. No
          entanto, alguns dos operadores mencionados na Seção 4 — Cloudinary (Estados
          Unidos), Brevo (União Europeia) e Google Maps Platform (Estados Unidos) — realizam
          o tratamento de dados fora do território nacional, o que caracteriza{' '}
          <strong>transferência internacional de dados pessoais</strong>.
        </p>
        <p>
          Essas transferências são realizadas com base nas salvaguardas previstas no artigo
          33 da LGPD, adotando os operadores cláusulas contratuais, padrões de proteção de
          dados e certificações compatíveis com a legislação brasileira, de modo a assegurar
          nível de proteção adequado aos dados pessoais tratados.
        </p>
      </LegalSection>

      <LegalSection title="6. Retenção de dados">
        <p>
          Mantemos os dados pessoais pelo tempo necessário ao cumprimento das finalidades
          para as quais foram coletados, observados os prazos exigidos por obrigações legais,
          regulatórias e fiscais (por exemplo, guarda de registros de transações financeiras
          e comprovantes fiscais) e o prazo prescricional aplicável para o exercício regular
          de direitos em processos judiciais, administrativos ou arbitrais.
        </p>
        <p>
          Encerrada uma conta, os dados são retidos pelo prazo mínimo necessário às
          finalidades acima e, após esse período, eliminados ou anonimizados, salvo quando a
          lei exigir prazo de guarda diverso.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança da informação">
        <p>
          Adotamos medidas técnicas e administrativas aptas a proteger os dados pessoais de
          acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda,
          alteração, comunicação ou qualquer forma de tratamento inadequado ou ilícito,
          incluindo criptografia de senhas, controle de acesso e monitoramento de nossos
          sistemas.
        </p>
        <p>
          Nenhum sistema é completamente livre de riscos. Caso ocorra um incidente de
          segurança que possa acarretar risco ou dano relevante aos titulares, a DROP
          adotará as providências cabíveis, incluindo a comunicação aos titulares e à
          Autoridade Nacional de Proteção de Dados (ANPD), quando exigido pela LGPD.
        </p>
      </LegalSection>

      <LegalSection title="8. Direitos do titular de dados">
        <p>
          Nos termos do artigo 18 da LGPD, o titular dos dados pessoais tem direito a obter,
          a qualquer momento e mediante requisição, entre outros: confirmação da existência
          de tratamento; acesso aos dados; correção de dados incompletos, inexatos ou
          desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou
          tratados em desconformidade com a lei; portabilidade dos dados; eliminação dos
          dados tratados com base no consentimento; informação sobre entidades com as quais
          os dados foram compartilhados; e revogação do consentimento.
        </p>
        <p>
          Para exercer esses direitos, acesse nosso{' '}
          <a href="/privacidade/solicitacoes">canal de solicitações do titular</a>, que
          explica cada direito em detalhe e como formalizar o pedido junto ao Encarregado.
        </p>
      </LegalSection>

      <LegalSection title="9. Cookies e tecnologias semelhantes">
        <p>
          A DROP utiliza cookies e tecnologias semelhantes (como armazenamento local do
          navegador) para manter sua sessão ativa e viabilizar o funcionamento da Plataforma.
          Os detalhes sobre as categorias utilizadas, suas finalidades e como gerenciar suas
          preferências estão descritos na nossa{' '}
          <a href="/cookies">Política de Cookies</a>.
        </p>
      </LegalSection>

      <LegalSection title="10. Alterações desta política">
        <p>
          Esta Política de Privacidade pode ser atualizada periodicamente para refletir
          mudanças na Plataforma, na legislação aplicável ou em nossas práticas de
          tratamento de dados. A versão vigente e a data da última atualização estão sempre
          indicadas no topo desta página.
        </p>
        <p>
          Alterações relevantes serão comunicadas aos usuários pelos canais habituais da
          Plataforma. Caso a alteração implique novo fundamento de tratamento que exija
          consentimento, este será novamente solicitado ao titular antes de sua aplicação.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
