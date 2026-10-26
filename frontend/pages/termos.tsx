import LegalPage, { LegalSection } from '../components/legal/LegalPage';
import { LEGAL_VERSIONS, LEGAL_UPDATED, LEGAL_OPERATOR_NAME, PRIVACY_EMAIL } from '../lib/legalDocs';

// Resumo "O essencial" validado pelo dono em 2026-10-11. A frase do motoboy não cita percentual:
// a parte dele muda por modo (custódia × SaaS) e é configurável pelo admin.
const TERMS_SUMMARY = [
  'A loja vende e responde pelo produto.',
  'O motoboy é autônomo e fica com a maior parte da taxa de entrega.',
  'Cancelar antes da retirada é grátis.',
  'O estorno volta para onde você pagou.',
];

// Versão 2.0 (2026-10-11): DROP operada por pessoa física; cobre os dois modos de pagamento
// (direto/SaaS e custódia). Regras de cancelamento conferidas com utils/cancellationFee.ts.
// Versão 2.1 (2026-10-26): reembolso de pedido entregue (services/returnRequest.ts, returnFee.ts),
// motoboy que não conclui depois de retirar e loja só com CNPJ.
export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" version={LEGAL_VERSIONS.terms} updatedAt={LEGAL_UPDATED} summary={TERMS_SUMMARY}>
      <LegalSection id="aceitacao" title="1. Quem somos e aceitação">
        <p>
          Estes Termos de Uso ("Termos") regem o uso da plataforma DROP ("DROP",
          "Plataforma", "nós"), desenvolvida e operada por {LEGAL_OPERATOR_NAME}, pessoa
          física. Contato: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
        <p>
          A DROP é um projeto em fase inicial. Ao criar uma conta ou usar a Plataforma, como
          cliente, lojista ou motoboy, você declara que leu e concorda com estes Termos e com
          a nossa Política de Privacidade. Se não concordar, não use a Plataforma.
        </p>
        <p>
          Se você usa a DROP em nome de uma empresa (por exemplo, como lojista), declara ter
          poderes para aceitar estes Termos em nome dela.
        </p>
      </LegalSection>

      <LegalSection id="servico" title="2. O que a DROP faz">
        <p>
          A DROP é uma ferramenta de tecnologia que conecta clientes, lojas e entregadores
          autônomos ("motoboys"). Ela oferece catálogo, pedido, pagamento online, entrega
          com rastreio e conversa entre as partes.
        </p>
        <p>
          <strong>A DROP não vende os produtos.</strong> Quem vende é a loja, que responde
          pelo produto, pelo preço anunciado, pela nota fiscal e pela troca ou devolução, nos
          termos do Código de Defesa do Consumidor. O motoboy é autônomo e responde pela
          execução da entrega.
        </p>
        <p>
          Os produtos vendidos na DROP são bens de consumo não essenciais. A DROP não garante
          disponibilidade, prazo ou continuidade de fornecimento de nenhum produto.
        </p>
      </LegalSection>

      <LegalSection id="contas" title="3. Contas e verificação">
        <ul>
          <li>
            <strong>Cliente:</strong> pessoa física que compra na Plataforma. Para comprar,
            confirma o e-mail e envia um documento com CPF. É responsável pelos dados que
            informa e pelo sigilo da senha.
          </li>
          <li>
            <strong>Lojista:</strong> empresa com CNPJ que vende na Plataforma. Passa pela
            verificação de CNPJ e endereço e, no pagamento direto, conecta a conta Asaas da
            empresa (ver Seção 4). Responde pelas informações dos produtos e pelas obrigações
            fiscais e de consumo da venda.
          </li>
          <li>
            <strong>Motoboy:</strong> pessoa física que faz as entregas. Envia documento,
            selfie, CNH e placa, e responde pela regularidade da habilitação e do veículo.
          </li>
        </ul>
        <p>
          Lojistas e motoboys são parceiros independentes. Não há vínculo de emprego,
          sociedade ou representação com a DROP, e cada um cuida das próprias obrigações
          fiscais e previdenciárias.
        </p>
        <p>
          A DROP pode pedir verificação adicional a qualquer momento e recusar, suspender ou
          encerrar cadastros que não atendam aos critérios de segurança.
        </p>
      </LegalSection>

      <LegalSection id="pagamentos" title="4. Pagamentos">
        <p>
          Os pagamentos online (Pix e cartão) são processados pela <strong>Asaas</strong>{' '}
          (Asaas Gestão Financeira Instituição de Pagamento S.A.). A DROP não guarda os dados
          do cartão. A Plataforma funciona em um de dois modos, sempre informado na sacola e
          no painel da loja:
        </p>
        <ul>
          <li>
            <strong>Pagamento direto à loja:</strong> o cliente paga direto na conta Asaas da
            loja. A DROP não recebe nem guarda o valor do pedido. A loja autoriza a DROP a
            gerar as cobranças, fazer os estornos e pagar ao motoboy a taxa da entrega a partir
            da conta dela, nos termos da autorização que aceita ao conectar o Asaas.
          </li>
          <li>
            <strong>Pagamento com custódia:</strong> o cliente paga à DROP, que guarda o valor
            na Asaas até a entrega e então repassa à loja e ao motoboy, descontando as
            comissões da Seção 5. Neste modo o cliente também pode ter saldo na carteira da
            DROP, vindo de estornos ou créditos, e usá-lo em compras.
          </li>
        </ul>
        <p>
          O cliente autoriza a cobrança do valor total mostrado na sacola: produtos, taxa de
          entrega e, no cartão parcelado, o custo do parcelamento, exibido antes de pagar. O
          Pix expira se não for pago no prazo mostrado na tela.
        </p>
      </LegalSection>

      <LegalSection id="remuneracao" title="5. Quanto a DROP cobra">
        <ul>
          <li>
            <strong>Cliente:</strong> não paga taxa de serviço à DROP. Paga os produtos e a
            taxa de entrega, calculada pela distância da rota.
          </li>
          <li>
            <strong>Loja no pagamento direto:</strong> paga uma mensalidade, com período de
            teste grátis. O valor, o teste e a tolerância de atraso aparecem no painel da loja.
            Se a mensalidade ficar em atraso além da tolerância, a loja sai da vitrine e deixa
            de receber pedidos novos até pagar. Os pedidos em andamento seguem normalmente.
          </li>
          <li>
            <strong>Loja na custódia:</strong> paga uma comissão sobre as vendas, que varia
            conforme o plano escolhido e aparece no painel da loja.
          </li>
          <li>
            <strong>Motoboy:</strong> fica com a maior parte da taxa de entrega. A parte dele
            aparece no app do motoboy.
          </li>
        </ul>
        <p>
          Mudanças de valores são avisadas antes e valem só para pedidos e mensalidades
          futuros.
        </p>
      </LegalSection>

      <LegalSection id="cancelamento" title="6. Cancelamento, estorno e reembolso">
        <ul>
          <li>
            <strong>Cliente cancela antes de o motoboy retirar o pedido:</strong> é grátis, e o
            valor volta inteiro.
          </li>
          <li>
            <strong>Cliente cancela depois da retirada:</strong> a taxa de entrega fica com o
            motoboy, que já fez a viagem, e o restante volta ao cliente.
          </li>
          <li>
            <strong>A loja recusa ou cancela:</strong> o cliente recebe tudo de volta. Eventuais
            taxas são cobradas da loja, não do cliente. Se o motoboy desistir da corrida, o
            pedido volta para outro motoboy.
          </li>
          <li>
            <strong>A loja não aceita o pedido no prazo:</strong> o pedido é cancelado sozinho
            e o valor volta inteiro.
          </li>
          <li>
            <strong>Nenhum motoboy aceita a entrega no prazo:</strong> o cliente escolhe
            esperar mais ou cancelar, e o valor volta inteiro.
          </li>
          <li>
            <strong>O motoboy não conclui a entrega depois de retirar:</strong> o pacote volta
            para a loja e o cliente escolhe entre uma nova entrega ou o reembolso total,
            incluindo a taxa de entrega. O reembolso é feito quando a loja confirma que recebeu
            o pacote de volta.
          </li>
          <li>
            <strong>O cliente não está no endereço para receber:</strong> pode ser cobrada uma
            taxa sobre o pedido, mostrada no app, que remunera a viagem do motoboy.
          </li>
        </ul>
        <p>
          O estorno volta para onde o cliente pagou: o Pix ou o cartão, pela Asaas. Na
          custódia, a parte paga com saldo volta para a carteira. A tela de cancelamento
          mostra quanto vai voltar antes de confirmar.
        </p>
      </LegalSection>

      <LegalSection id="reembolso" title="7. Reembolso de pedido entregue">
        <p>
          Recebeu o pedido e quer devolver? O pedido de reembolso é feito pela própria
          Plataforma, na tela do pedido, sem prejuízo dos direitos do consumidor:
        </p>
        <ul>
          <li>
            <strong>Pedido:</strong> o cliente informa o motivo (produto com defeito, diferente
            do pedido ou arrependimento) e pode mandar um comentário e fotos.
          </li>
          <li>
            <strong>Decisão:</strong> a loja aprova ou recusa. A recusa sempre traz o motivo, e o
            cliente pode levar o caso ao suporte da DROP. Se a loja não responder no prazo, o
            suporte da DROP é avisado e acompanha o pedido.
          </li>
          <li>
            <strong>Devolução:</strong> aprovado, o cliente devolve o produto levando na loja, sem
            custo, ou chamando um motoboy pela Plataforma. No defeito ou produto diferente do
            pedido, a corrida do motoboy é paga pela loja. No arrependimento, o cliente paga a
            corrida por Pix antes de o motoboy sair, e esse valor não é devolvido.
          </li>
          <li>
            <strong>Cliente ausente na retirada:</strong> se o motoboy não encontrar o cliente
            no endereço, a corrida é encerrada e a devolução passa a ser levando o produto na
            loja.
          </li>
          <li>
            <strong>Quando o dinheiro volta:</strong> o reembolso é feito quando a loja confirma
            que recebeu o produto, com o código de devolução mostrado no app.
          </li>
          <li>
            <strong>Quanto volta:</strong> no defeito ou produto diferente do pedido, o valor
            total, com a taxa de entrega. No arrependimento dentro de 7 dias corridos da
            entrega (art. 49 do Código de Defesa do Consumidor), também o valor total. Depois
            desse prazo, o arrependimento devolve o valor dos produtos, sem a taxa de entrega,
            que já foi feita. A tela mostra o valor antes de o cliente enviar o pedido.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="condutas" title="8. O que não é permitido">
        <ul>
          <li>Informar dados falsos ou de outra pessoa sem autorização;</li>
          <li>Usar a Plataforma para fraude ou qualquer fim ilegal;</li>
          <li>Anunciar ou pedir produtos proibidos por lei;</li>
          <li>Combinar o pagamento por fora da Plataforma para fugir de mensalidade, comissão ou taxas;</li>
          <li>Assediar, ameaçar ou agredir outros usuários, lojistas ou motoboys;</li>
          <li>Tentar invadir, copiar ou sobrecarregar a Plataforma, ou usar robôs sem autorização;</li>
          <li>Criar várias contas para burlar suspensões ou limites.</li>
        </ul>
        <p>
          Quem descumprir pode receber advertência, suspensão ou encerramento da conta, sem
          prejuízo de outras medidas legais.
        </p>
      </LegalSection>

      <LegalSection id="propriedade" title="9. Propriedade intelectual">
        <p>
          A marca DROP, o logotipo, o design e o código da Plataforma pertencem a{' '}
          {LEGAL_OPERATOR_NAME}. Não é permitido copiar ou usar comercialmente sem
          autorização.
        </p>
        <p>
          Fotos e descrições enviadas pelas lojas continuam sendo delas. A loja autoriza a
          DROP a exibi-las na Plataforma enquanto o cadastro estiver ativo.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidade" title="10. Limites de responsabilidade">
        <p>
          A DROP se esforça para manter a Plataforma no ar e segura, mas não garante que ela
          funcione sem interrupções ou erros. Na medida permitida pela lei, a DROP não
          responde por:
        </p>
        <ul>
          <li>Qualidade, legalidade ou disponibilidade dos produtos anunciados pelas lojas;</li>
          <li>Danos ou atrasos na entrega causados pelo motoboy, salvo culpa da própria DROP;</li>
          <li>Mau uso da Plataforma por outros usuários;</li>
          <li>Falhas temporárias por manutenção, força maior ou serviços de terceiros (pagamento, mapas, hospedagem).</li>
        </ul>
        <p>
          Nada nesta seção limita direitos que a lei não permite limitar, incluindo os do
          Código de Defesa do Consumidor.
        </p>
      </LegalSection>

      <LegalSection id="suspensao" title="11. Suspensão e encerramento">
        <p>
          A DROP pode suspender ou encerrar contas que descumpram estes Termos, tenham sinais
          de fraude ou ponham em risco a Plataforma ou outras pessoas, avisando sempre que
          possível.
        </p>
        <p>
          Você pode pedir o encerramento da sua conta a qualquer momento. Pedidos em
          andamento e valores a receber ou a pagar são concluídos antes.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="12. Mudanças nestes Termos">
        <p>
          Estes Termos podem mudar. A versão e a data em vigor ficam no topo desta página, e
          mudanças importantes são avisadas por e-mail ou no app. Se você continuar usando a
          DROP depois que a mudança valer, concorda com a nova versão. Se não concordar, pode
          parar de usar e pedir o encerramento da conta.
        </p>
      </LegalSection>

      <LegalSection id="foro" title="13. Lei e foro">
        <p>
          Estes Termos seguem as leis do Brasil. Para o consumidor, vale o foro do domicílio
          dele. Nas demais relações, vale o foro do domicílio do responsável pela DROP,
          ressalvada a competência dos Juizados Especiais.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
