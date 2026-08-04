import LegalPage, { LegalSection } from '../components/legal/LegalPage';
import { LEGAL_VERSIONS, LEGAL_UPDATED } from '../lib/legalDocs';

export default function CookiesPage() {
  return (
    <LegalPage title="Política de Cookies" version={LEGAL_VERSIONS.cookies} updatedAt={LEGAL_UPDATED}>
      <LegalSection title="1. O que são cookies">
        <p>
          Cookies são pequenos arquivos de texto armazenados pelo navegador do usuário quando
          este acessa um site ou aplicativo. Tecnologias semelhantes — como o armazenamento
          local do navegador (<em>localStorage</em>) — cumprem função equivalente: permitir que
          o site reconheça o dispositivo em visitas subsequentes e mantenha informações entre
          uma página e outra.
        </p>
        <p>
          Esta Política explica quais cookies e tecnologias semelhantes a DROP utiliza, para
          que servem e como o usuário pode gerenciar suas preferências.
        </p>
      </LegalSection>

      <LegalSection title="2. Categorias que utilizamos hoje">
        <p>
          Atualmente a DROP utiliza <strong>apenas cookies e armazenamento local
          essenciais/de sessão</strong>, necessários para o funcionamento básico da
          Plataforma. Não utilizamos, no momento, cookies de <strong>analytics</strong>,
          publicidade ou rastreamento de terceiros para fins de perfilamento ou marketing.
        </p>
        <ul>
          <li>
            <strong>Essenciais / sessão:</strong> armazenados via <em>localStorage</em> do
            navegador, guardam o token de autenticação e dados mínimos de sessão, permitindo
            que o usuário permaneça conectado à sua conta ao navegar entre páginas e que a
            Plataforma reconheça seu perfil (cliente, lojista ou motoboy) durante o uso.
          </li>
          <li>
            <strong>Preferências do banner de cookies:</strong> armazenamos, também em{' '}
            <em>localStorage</em>, a escolha feita pelo usuário no banner de cookies (aceitar
            ou manter apenas os essenciais), para não exibir o aviso novamente a cada
            visita.
          </li>
        </ul>
        <p>
          Caso a DROP passe a utilizar cookies de analytics ou de terceiros no futuro, esta
          Política será atualizada previamente e o banner de cookies passará a oferecer a
          opção de aceitar ou recusar essas categorias não essenciais especificamente.
        </p>
      </LegalSection>

      <LegalSection title="3. Finalidade de cada categoria">
        <p>Os cookies e tecnologias semelhantes que utilizamos servem às seguintes finalidades:</p>
        <ul>
          <li>
            <strong>Autenticação e sessão:</strong> manter o usuário conectado à sua conta e
            identificar seu perfil de acesso, evitando a necessidade de novo login a cada
            página.
          </li>
          <li>
            <strong>Segurança:</strong> apoiar mecanismos de proteção da conta e da
            Plataforma contra acessos não autorizados.
          </li>
          <li>
            <strong>Funcionamento da interface:</strong> lembrar preferências simples de
            navegação, como a escolha feita no banner de cookies.
          </li>
        </ul>
        <p>
          Nenhuma dessas finalidades envolve, hoje, rastreamento entre sites, criação de
          perfis publicitários ou venda de dados de navegação a terceiros.
        </p>
      </LegalSection>

      <LegalSection title="4. Como gerenciar ou recusar">
        <p>
          Na primeira visita à DROP, um <strong>banner de cookies</strong> é exibido,
          informando de forma resumida o uso descrito nesta Política e oferecendo as opções
          de aceitar ou manter apenas os cookies essenciais. A escolha feita fica salva no
          navegador e pode ser revista a qualquer momento limpando os dados de navegação do
          site, o que faz o banner ser exibido novamente.
        </p>
        <p>
          Como os cookies essenciais/de sessão são indispensáveis para manter o usuário
          autenticado e para o funcionamento básico da Plataforma, recusá-los ou bloqueá-los
          impede o uso de funcionalidades que dependem de login (por exemplo, realizar
          pedidos, acessar o painel do lojista ou do motoboy).
        </p>
        <p>
          Além do banner, o usuário pode gerenciar cookies e dados de navegação diretamente
          nas <strong>configurações do navegador</strong> utilizado (Chrome, Firefox, Safari,
          Edge, entre outros), incluindo bloquear, apagar ou ser avisado sobre novos cookies.
          Essas configurações variam conforme o navegador e o dispositivo; recomendamos
          consultar a documentação de ajuda do navegador utilizado para instruções
          específicas.
        </p>
      </LegalSection>

      <LegalSection title="5. Consentimento">
        <p>
          Ao continuar navegando na DROP após a exibição do banner de cookies, ou ao
          selecionar explicitamente a opção "Aceitar" no banner, o usuário manifesta seu
          consentimento quanto ao uso dos cookies e tecnologias descritos nesta Política, na
          forma da Lei Geral de Proteção de Dados Pessoais (LGPD).
        </p>
        <p>
          Como hoje a Plataforma utiliza somente cookies essenciais/de sessão — necessários
          à prestação do serviço contratado pelo usuário —, o funcionamento da DROP não
          depende de consentimento específico para essa categoria. Caso cookies não
          essenciais (por exemplo, de analytics) sejam adotados futuramente, o consentimento
          para essas categorias será solicitado de forma destacada e granular, podendo ser
          recusado sem prejuízo ao uso das funcionalidades essenciais da Plataforma.
        </p>
        <p>
          Para mais informações sobre como tratamos dados pessoais de forma geral, consulte a
          nossa <a href="/privacidade">Política de Privacidade</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
