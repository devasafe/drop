import LegalPage, { LegalSection } from '../components/legal/LegalPage';
import { LEGAL_VERSIONS, LEGAL_UPDATED } from '../lib/legalDocs';
import styles from '../components/legal/LegalPage.module.css';

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" version={LEGAL_VERSIONS.terms} updatedAt={LEGAL_UPDATED}>
      <LegalSection title="1. Aceitação dos termos">
        <p>
          Estes Termos de Uso ("Termos") regem o acesso e a utilização da plataforma DROP
          ("DROP", "Plataforma", "nós"), operada por{' '}
          <span className={styles.placeholder}>[RAZÃO SOCIAL]</span>, inscrita no CNPJ sob o nº{' '}
          <span className={styles.placeholder}>[CNPJ]</span>, com sede em{' '}
          <span className={styles.placeholder}>[ENDEREÇO DA EMPRESA]</span>.
        </p>
        <p>
          Ao criar uma conta, acessar ou utilizar a DROP — seja como cliente, lojista ou
          motoboy — você declara que leu, compreendeu e concorda integralmente com estes
          Termos e com a nossa Política de Privacidade. Caso não concorde com qualquer
          disposição aqui prevista, você não deve utilizar a Plataforma.
        </p>
        <p>
          Se você utiliza a DROP em nome de uma pessoa jurídica (por exemplo, como lojista),
          declara ter poderes para vinculá-la a estes Termos.
        </p>
      </LegalSection>

      <LegalSection title="2. Descrição do serviço">
        <p>
          A DROP é um marketplace que conecta clientes, lojistas e entregadores parceiros
          ("motoboys") para a compra, venda e entrega de produtos oferecidos por lojas
          cadastradas na Plataforma. A DROP atua exclusivamente como intermediadora
          tecnológica dessas relações, disponibilizando ferramentas de catálogo, pedido,
          pagamento, rastreamento e comunicação entre as partes.
        </p>
        <p>
          Os itens comercializados por meio da Plataforma são bens de consumo{' '}
          <strong>não essenciais</strong>. A DROP não é uma plataforma de itens de primeira
          necessidade (alimentação básica, medicamentos de uso contínuo, entre outros) e não
          garante disponibilidade, prazo ou continuidade de fornecimento de qualquer produto.
        </p>
        <p>
          A DROP não é parte na relação de compra e venda entre cliente e lojista, tampouco no
          contrato de transporte entre lojista/cliente e motoboy, salvo nas obrigações que
          assume expressamente nestes Termos (por exemplo, o processamento e a custódia de
          pagamentos, conforme Seção 4).
        </p>
      </LegalSection>

      <LegalSection title="3. Tipos de conta e regras de cada perfil">
        <p>
          A Plataforma disponibiliza três tipos de conta, cada um sujeito a regras próprias de
          cadastro, verificação e uso:
        </p>
        <ul>
          <li>
            <strong>Cliente:</strong> pessoa física que utiliza a DROP para navegar em lojas,
            realizar pedidos e efetuar pagamentos. É responsável pela veracidade dos dados
            informados e pelo uso adequado da conta e da senha.
          </li>
          <li>
            <strong>Lojista:</strong> pessoa física ou jurídica que cadastra e comercializa
            produtos na Plataforma. Está sujeito a processo de verificação (KYC), incluindo
            CNPJ e comprovante de endereço quando aplicável, é responsável pela veracidade das
            informações dos produtos, pelo cumprimento da legislação consumerista e fiscal
            aplicável, e pela disponibilidade e qualidade do que anuncia.
          </li>
          <li>
            <strong>Motoboy:</strong> pessoa física que realiza entregas vinculadas aos pedidos
            processados pela Plataforma. Está sujeito a processo de verificação (KYC),
            incluindo CNH e placa do veículo, além de documento de identificação e selfie para
            confirmação biométrica. É responsável pela regularidade de sua habilitação, de seu
            veículo e pela correta execução da entrega.
          </li>
        </ul>
        <p>
          A relação entre a DROP e lojistas ou motoboys não configura vínculo empregatício,
          societário ou de representação. Lojistas e motoboys atuam como parceiros
          independentes, responsáveis por suas próprias obrigações fiscais, trabalhistas e
          previdenciárias.
        </p>
        <p>
          A DROP pode exigir verificação adicional de identidade a qualquer momento e recusar,
          suspender ou encerrar cadastros que não atendam aos critérios de segurança e
          conformidade da Plataforma.
        </p>
      </LegalSection>

      <LegalSection title="4. Pagamentos e custódia">
        <p>
          Os pagamentos realizados na Plataforma são processados por meio da{' '}
          <strong>Asaas</strong>, instituição de pagamento parceira, que atua como processadora
          e custodiante dos valores até a sua liberação aos destinatários (lojista e motoboy).
        </p>
        <p>
          Ao concluir um pedido, o cliente autoriza a cobrança do valor total (produtos, taxa
          de entrega e eventuais encargos aplicáveis) pelos meios de pagamento disponibilizados
          na Plataforma. Os valores ficam retidos em custódia até a confirmação das etapas do
          pedido, quando então são repassados ao lojista e ao motoboy, descontadas as comissões
          e taxas previstas nestes Termos.
        </p>
        <p>
          Lojistas e motoboys devem manter conta habilitada junto à Asaas (subconta) e dados
          bancários/PIX válidos para recebimento dos repasses. A DROP não se responsabiliza por
          atrasos ou falhas decorrentes de informações bancárias incorretas ou de
          indisponibilidade dos sistemas da Asaas.
        </p>
      </LegalSection>

      <LegalSection title="5. Comissões">
        <p>
          A DROP retém uma comissão sobre as transações realizadas na Plataforma, como
          contrapartida pela intermediação, processamento de pagamentos e demais serviços
          disponibilizados a lojistas e motoboys.
        </p>
        <ul>
          <li>
            O percentual de comissão <strong>varia conforme o plano</strong> contratado pelo
            lojista junto à DROP.
          </li>
          <li>
            A comissão pode incidir sobre o valor da <strong>venda</strong> (produtos) e/ou
            sobre o valor da <strong>entrega</strong>, conforme as regras do plano vigente.
          </li>
        </ul>
        <p>
          Os percentuais de comissão vigentes para cada plano estão sempre disponíveis na
          página de planos da Plataforma e no painel do lojista. Eventuais alterações de
          percentual são comunicadas previamente e aplicam-se apenas a transações futuras,
          nunca retroativamente a pedidos já concluídos.
        </p>
      </LegalSection>

      <LegalSection title="6. Cancelamento, taxas e reembolso">
        <p>
          Pedidos podem ser cancelados nas hipóteses e prazos descritos no fluxo de pedido da
          Plataforma. O cancelamento pode gerar a cobrança de uma <strong>taxa</strong>, cujo
          valor varia conforme <strong>quem solicita o cancelamento</strong> e o momento em que
          ele ocorre:
        </p>
        <ul>
          <li>
            <strong>Cancelamento pelo cliente:</strong> a taxa incide sobre o valor{' '}
            <strong>total</strong> do pedido (produtos e entrega).
          </li>
          <li>
            <strong>Cancelamento pela loja ou pelo motoboy:</strong> a taxa incide sobre o valor
            da <strong>entrega</strong>.
          </li>
        </ul>
        <p>
          Quando aplicável, o <strong>reembolso ao cliente é líquido</strong>, ou seja, é feito
          descontando-se a taxa de cancelamento correspondente, por meio de estorno parcial
          processado via Asaas.
        </p>
        <p>
          Nos casos em que o cancelamento ocorre após o motoboy já ter iniciado a execução da
          entrega, parte da taxa cobrada é destinada a ele, como compensação pelo trabalho já
          iniciado.
        </p>
        <p>
          Os prazos e janelas de tempo relevantes para cancelamento (por exemplo, tempo de
          aceite da loja, tempo de espera na fila de motoboys, ausência do cliente no momento
          da entrega) e os percentuais de taxa vigentes são exibidos no fluxo do pedido no
          momento do cancelamento e/ou no painel do usuário. Alterações nesses valores aplicam-se
          apenas a pedidos futuros.
        </p>
      </LegalSection>

      <LegalSection title="7. Condutas proibidas">
        <p>Ao utilizar a DROP, você concorda em não:</p>
        <ul>
          <li>Fornecer informações falsas, incompletas ou de terceiros sem autorização no cadastro ou na verificação de identidade;</li>
          <li>Utilizar a Plataforma para fins ilícitos, fraudulentos ou que violem direitos de terceiros;</li>
          <li>Anunciar, comercializar ou solicitar produtos proibidos por lei ou pelas políticas da Plataforma;</li>
          <li>Tentar contornar os meios de pagamento e cobrança oferecidos pela Plataforma para evitar comissões ou taxas;</li>
          <li>Assediar, ameaçar ou agredir, verbal ou fisicamente, outros usuários, lojistas ou motoboys;</li>
          <li>Interferir no funcionamento técnico da Plataforma, incluindo tentativas de acesso não autorizado, engenharia reversa ou uso de robôs/scripts automatizados sem autorização;</li>
          <li>Criar múltiplas contas para burlar suspensões, bloqueios ou limites da Plataforma.</li>
        </ul>
        <p>
          A violação de qualquer conduta prevista nesta Seção pode resultar em advertência,
          suspensão temporária ou encerramento definitivo da conta, sem prejuízo de outras
          medidas legais cabíveis.
        </p>
      </LegalSection>

      <LegalSection title="8. Propriedade intelectual">
        <p>
          A marca DROP, seu logotipo, layout, design, código-fonte, funcionalidades e demais
          elementos da Plataforma são de titularidade de{' '}
          <span className={styles.placeholder}>[RAZÃO SOCIAL]</span> ou de seus licenciadores,
          sendo protegidos pela legislação de propriedade intelectual aplicável.
        </p>
        <p>
          É vedada a reprodução, distribuição, modificação ou uso comercial de qualquer
          elemento da Plataforma sem autorização prévia e expressa. Conteúdos enviados por
          lojistas (fotos, descrições de produtos) permanecem de titularidade destes, que
          concedem à DROP licença não exclusiva para exibi-los na Plataforma enquanto o
          cadastro estiver ativo.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitação de responsabilidade">
        <p>
          A DROP envida esforços para manter a Plataforma disponível, segura e funcional, mas
          não garante operação ininterrupta ou livre de erros. Na máxima extensão permitida
          pela legislação aplicável, a DROP não se responsabiliza por:
        </p>
        <ul>
          <li>Qualidade, conformidade, legalidade ou disponibilidade dos produtos anunciados por lojistas;</li>
          <li>Atrasos, extravios ou danos ocorridos durante o transporte realizado por motoboys parceiros, ressalvadas as hipóteses em que a própria DROP tenha agido com culpa ou dolo direto;</li>
          <li>Prejuízos decorrentes de uso indevido da Plataforma por outros usuários;</li>
          <li>Indisponibilidade temporária decorrente de manutenção, caso fortuito, força maior ou falhas de terceiros (incluindo provedores de pagamento, mapas e infraestrutura).</li>
        </ul>
        <p>
          Nada nesta Seção exclui ou limita direitos que não possam ser excluídos ou limitados
          por lei, incluindo os direitos assegurados ao consumidor pelo Código de Defesa do
          Consumidor.
        </p>
      </LegalSection>

      <LegalSection title="10. Suspensão e encerramento de conta">
        <p>
          A DROP pode suspender ou encerrar, a qualquer momento e mediante comunicação ao
          usuário sempre que possível, contas que descumpram estes Termos, apresentem indícios
          de fraude, coloquem em risco a segurança da Plataforma ou de terceiros, ou por
          determinação legal ou de autoridade competente.
        </p>
        <p>
          O usuário pode solicitar o encerramento de sua própria conta a qualquer momento,
          observadas eventuais obrigações pendentes (pedidos em andamento, valores a receber ou
          a pagar).
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações destes termos">
        <p>
          Estes Termos podem ser atualizados periodicamente para refletir mudanças na
          Plataforma, na legislação aplicável ou nas práticas de mercado. A versão vigente e a
          data da última atualização estão sempre indicadas no topo desta página.
        </p>
        <p>
          Alterações relevantes serão comunicadas aos usuários pelos canais habituais da
          Plataforma (por exemplo, e-mail ou aviso no aplicativo). A continuidade do uso da
          DROP após a entrada em vigor das alterações implica concordância com os novos Termos.
          Caso as alterações não sejam aceitas, o usuário deve descontinuar o uso da Plataforma
          e pode solicitar o encerramento de sua conta.
        </p>
      </LegalSection>

      <LegalSection title="12. Foro e legislação aplicável">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
          foro da comarca de{' '}
          <span className={styles.placeholder}>[ENDEREÇO DA EMPRESA]</span>, com renúncia a
          qualquer outro, por mais privilegiado que seja, para dirimir controvérsias
          decorrentes destes Termos, ressalvada a competência dos Juizados Especiais e do foro
          do domicílio do consumidor, quando aplicável por força de lei.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
