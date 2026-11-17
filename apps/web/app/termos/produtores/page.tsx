import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal-doc";
import { contactLine } from "@/lib/legal";

export const metadata: Metadata = { title: "Contrato do Produtor", description: "Regras para vender no Domma Mart: taxas, prazos de liberação, saques, reembolsos, contestações e conteúdo permitido.", alternates: { canonical: "/termos/produtores" } };

const sections: LegalSection[] = [
  {
    id: "partes",
    title: "Quem pode vender",
    summary: "Para vender, você precisa ter 18 anos ou mais, informar dados verdadeiros e ser dono do que vende ou ter autorização para vender.",
    body: (
      <>
        <p>
          Este contrato vale entre o Domma Mart e a pessoa ou empresa que cria uma conta de produtor. Ele complementa os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
        <p>Ao vender, você declara que tem 18 anos ou mais, que os dados informados são verdadeiros e que tem os direitos sobre o conteúdo, a marca e as imagens que usa, ou autorização de quem tem.</p>
        <p>O Domma Mart presta o serviço de plataforma e de intermediação de pagamento. Você é o fornecedor do produto perante o comprador.</p>
      </>
    ),
  },
  {
    id: "verificacao",
    title: "Verificação de identidade",
    summary: "Você já pode vender ao criar a conta. Antes do primeiro saque, conferimos seu CPF ou CNPJ, um documento com foto e uma selfie.",
    body: (
      <>
        <p>Para sacar, é preciso concluir a verificação de identidade: CPF ou CNPJ do titular, chave Pix no mesmo CPF ou CNPJ, foto de um documento oficial com foto e uma selfie segurando o documento.</p>
        <p>Uma pessoa da equipe confere os dados em até 1 dia útil. Se faltar algo, você recebe por e-mail o que precisa corrigir. Enquanto a verificação não é aprovada, você continua vendendo e o saldo fica guardado.</p>
        <p>A verificação existe para cumprir regras de prevenção à fraude e à lavagem de dinheiro e para proteger a sua conta. O Domma Mart pode pedir a verificação de novo se houver mudança de titular, de chave Pix ou sinal de uso indevido.</p>
      </>
    ),
  },
  {
    id: "produtos",
    title: "O que pode e o que não pode ser vendido",
    summary: "Todo produto passa por análise antes de ir ao ar. Promessa de ganho garantido, apostas, conteúdo adulto, pirataria e produtos de saúde sem profissional não são aceitos.",
    body: (
      <>
        <p>Cada produto é analisado antes de ser publicado. Uma triagem automática por inteligência artificial faz a primeira leitura; nos casos de dúvida ou recusa, a decisão final é sempre de uma pessoa da equipe, com o motivo por escrito. Você pode contestar a decisão, e a resposta sai em até 5 dias úteis.</p>
        <p>Não são aceitos:</p>
        <ul>
          <li>promessa de ganho, renda ou resultado garantido, esquemas de pirâmide e marketing multinível disfarçado;</li>
          <li>apostas, jogos de azar e grupos de sinais;</li>
          <li>conteúdo adulto;</li>
          <li>produtos de saúde, tratamentos ou dietas sem um profissional habilitado responsável;</li>
          <li>armas, drogas e documentos falsos;</li>
          <li>pirataria, como cursos de terceiros, rateios e pacotes de conteúdo sem autorização;</li>
          <li>venda de dados pessoais, listas de contatos ou contas de redes sociais;</li>
          <li>qualquer produto ilegal ou que viole direitos de outras pessoas.</li>
        </ul>
        <p>A divulgação precisa ser verdadeira: preço, garantia e o que o produto entrega devem ser os mesmos do checkout. O Domma Mart pode pausar um produto que receba muitas reclamações, reembolsos ou denúncias, informando o motivo.</p>
      </>
    ),
  },
  {
    id: "taxas",
    title: "Taxas",
    summary: "Você paga uma taxa por venda aprovada. Não há mensalidade nem taxa de saque. A tabela que vale para a sua conta está sempre no painel Financeiro.",
    body: (
      <>
        <p>O Domma Mart cobra uma taxa por venda aprovada, formada por um percentual e um valor fixo, conforme a forma de pagamento. Não há mensalidade, taxa de adesão nem taxa de saque.</p>
        <p>
          A tabela em vigor para a sua conta aparece no painel <strong>Financeiro</strong>, em linguagem simples, e no detalhe de cada venda. Cada venda guarda a taxa do dia em que foi feita: uma mudança de tabela nunca altera vendas já realizadas.
        </p>
        <p>No cartão parcelado, os juros do parcelamento são pagos pelo comprador, a menos que você escolha assumir.</p>
        <p>Mudanças na tabela geral são avisadas com pelo menos 30 dias de antecedência. Condições próprias de uma conta só são alteradas com a aprovação de duas pessoas da equipe.</p>
      </>
    ),
  },
  {
    id: "liberacao",
    title: "Quando o dinheiro fica disponível",
    summary: "O valor de cada venda entra como “a liberar” e passa para “disponível” na data prevista, que aparece no painel. Contas novas têm prazo maior e uma reserva de segurança temporária.",
    body: (
      <>
        <p>O valor líquido de cada venda aparece no seu saldo em três situações:</p>
        <ul>
          <li>
            <strong>A liberar:</strong> valor de vendas recentes, com a data em que fica disponível.
          </li>
          <li>
            <strong>Disponível:</strong> valor que já pode ser sacado.
          </li>
          <li>
            <strong>Reservado:</strong> parte de cada venda guardada por um período como reserva de segurança, para cobrir reembolsos e contestações. A reserva volta sozinha para o disponível na data indicada.
          </li>
        </ul>
        <p>Os prazos e o percentual de reserva dependem da forma de pagamento, do tempo de conta e dos seus indicadores de reembolso e de contestação. Contas novas começam com prazo maior e com reserva; contas com mais tempo e bons indicadores passam a prazos menores e sem reserva. A regra que vale para a sua conta hoje aparece no painel Financeiro.</p>
      </>
    ),
  },
  {
    id: "saques",
    title: "Saques",
    summary: "O saque é grátis e vai por Pix para uma chave no mesmo CPF ou CNPJ da conta. Trocar a chave pausa os saques por um período, por segurança.",
    body: (
      <>
        <p>Você saca o saldo disponível quando quiser, sem taxa, para a chave Pix cadastrada, que precisa estar no mesmo CPF ou CNPJ do titular da conta.</p>
        <p>Cada saque é confirmado por um código enviado ao seu e-mail. Quando a chave Pix é trocada, os saques ficam pausados por um período de segurança informado na tela, e você recebe um aviso por e-mail.</p>
        <p>O Domma Mart pode pausar os saques de uma conta em caso de suspeita de fraude, de pico de reembolsos ou de contestações, ou por ordem de autoridade. O motivo é sempre informado por escrito, a análise tem prazo máximo de 5 dias úteis e fica retido apenas o valor ligado ao que está sendo analisado.</p>
      </>
    ),
  },
  {
    id: "reembolsos",
    title: "Reembolsos",
    summary: "Dentro da garantia, o reembolso é automático e você não pode recusar. O valor sai do seu saldo, e a taxa da venda é devolvida a você.",
    body: (
      <>
        <p>Toda venda tem garantia de no mínimo 7 dias. Você pode oferecer um prazo maior. Dentro da garantia, o reembolso pedido pelo comprador é aprovado automaticamente.</p>
        <p>Depois da garantia, o pedido chega para você decidir em até 5 dias úteis. Você também pode reembolsar uma venda por iniciativa própria a qualquer momento.</p>
        <p>No reembolso, o valor líquido da venda sai do seu saldo, começando pelo que ainda não foi liberado, e o Domma Mart devolve a taxa cobrada naquela venda. Se o saldo disponível não for suficiente, ele pode ficar negativo e é compensado com as próximas vendas.</p>
      </>
    ),
  },
  {
    id: "contestacoes",
    title: "Contestações (chargeback)",
    summary: "Se o comprador contestar a compra no banco, o valor fica separado até a decisão. Você envia as provas pelo painel e a equipe apresenta a defesa.",
    body: (
      <>
        <p>Quando o comprador contesta a compra no banco do cartão, o valor líquido daquela venda passa para “em contestação” e você é avisado por e-mail, com o prazo para enviar provas.</p>
        <p>Pelo detalhe da venda, você conta o que comprova a entrega. A equipe junta isso aos registros de acesso do comprador e apresenta a defesa ao banco. A decisão final é do banco.</p>
        <ul>
          <li>
            <strong>Contestação ganha:</strong> o valor volta para o seu saldo disponível.
          </li>
          <li>
            <strong>Contestação perdida:</strong> o valor é devolvido ao comprador, o acesso é encerrado e o Domma Mart devolve a taxa daquela venda.
          </li>
        </ul>
        <p>Índices altos de reembolso ou de contestação aumentam o prazo de liberação e a reserva da conta e podem levar à pausa dos produtos.</p>
      </>
    ),
  },
  {
    id: "obrigacoes",
    title: "Suas obrigações",
    summary: "Entregar o que vendeu, atender seus compradores, emitir nota fiscal quando a lei exigir e cuidar dos dados dos compradores.",
    body: (
      <>
        <ul>
          <li>entregar o produto como anunciado e manter o conteúdo disponível pelo prazo prometido;</li>
          <li>informar um contato de suporte e responder aos compradores;</li>
          <li>cumprir as obrigações fiscais da sua atividade, inclusive a emissão de nota fiscal ao comprador quando exigida;</li>
          <li>usar os dados dos compradores apenas para entregar o produto, dar suporte e cumprir a lei. É proibido vender, ceder ou usar esses dados para outras finalidades sem o consentimento da pessoa;</li>
          <li>manter em segurança as chaves de API e os webhooks que você configurar.</li>
        </ul>
        <p>O Domma Mart não presta consultoria fiscal ou jurídica. O histórico de vendas, taxas e saques fica disponível no painel.</p>
      </>
    ),
  },
  {
    id: "encerramento",
    title: "Suspensão e encerramento",
    summary: "Você pode encerrar a conta quando quiser. O Domma Mart pode suspender contas que descumprem as regras, sempre com o motivo por escrito.",
    body: (
      <>
        <p>Você pode parar de vender e pedir o encerramento da conta a qualquer momento. O saldo é pago normalmente, respeitados os prazos de liberação, a reserva e os reembolsos e contestações em andamento.</p>
        <p>O Domma Mart pode suspender ou encerrar uma conta que descumpra este contrato, venda produtos não permitidos, apresente indícios de fraude ou mantenha índices de reembolso e de contestação fora do aceitável. A decisão é comunicada por escrito, com o motivo, e pode ser contestada pela página de Ajuda.</p>
        <p>Depois do encerramento, os compradores mantêm o acesso ao que compraram pelo prazo prometido, e os registros financeiros são guardados pelo tempo que a lei exige.</p>
      </>
    ),
  },
  {
    id: "geral",
    title: "Mudanças, lei aplicável e contato",
    summary: "Mudanças importantes são avisadas com 30 dias de antecedência. Vale a lei brasileira.",
    body: (
      <>
        <p>Este contrato pode ser atualizado. Mudanças que afetem taxas, prazos ou obrigações são avisadas por e-mail com pelo menos 30 dias de antecedência. Se não concordar, você pode encerrar a conta antes de a mudança valer.</p>
        <p>Este contrato segue a lei brasileira.</p>
        <p>Para falar com o Domma Mart, use a página de Ajuda ou escreva {contactLine()}.</p>
      </>
    ),
  },
];

export default function ProducerTermsPage() {
  return (
    <LegalDoc
      title="Contrato do Produtor"
      current="/termos/produtores"
      intro={<p>Este documento reúne as regras para quem vende no Domma Mart: o que pode ser vendido, quanto custa, quando o dinheiro fica disponível e o que acontece em reembolsos e contestações. Cada parte começa com um resumo.</p>}
      sections={sections}
    />
  );
}
