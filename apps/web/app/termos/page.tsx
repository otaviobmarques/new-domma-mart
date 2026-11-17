import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal-doc";
import { companyLine, contactLine } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de Uso", description: "Regras de uso do Domma Mart para quem compra e para quem vende produtos digitais.", alternates: { canonical: "/termos" } };

const sections: LegalSection[] = [
  {
    id: "o-que-e",
    title: "O que é o Domma Mart",
    summary: "O Domma Mart é a plataforma que processa o pagamento e entrega o acesso. Quem cria e responde pelo produto é o produtor indicado no checkout.",
    body: (
      <>
        <p>O Domma Mart é uma plataforma em que produtores vendem produtos digitais, como cursos, e-books, mentorias, comunidades e eventos. A plataforma oferece a página de pagamento, processa a cobrança, libera o acesso ao comprador e repassa ao produtor o valor da venda, descontadas as taxas.</p>
        <p>O Domma Mart é operado por {companyLine()}.</p>
        <p>
          O produto é criado, oferecido e entregue pelo <strong>produtor</strong>, cujo nome aparece no checkout e no e-mail de acesso. O Domma Mart não é autor do conteúdo e não garante o resultado que o produto promete. Ainda assim, a plataforma mantém regras de conteúdo, analisa produtos antes de irem ao ar e garante ao comprador o reembolso descrito na parte 5.
        </p>
      </>
    ),
  },
  {
    id: "aceite",
    title: "Quando estes termos valem",
    summary: "Ao criar uma conta ou concluir uma compra, você concorda com estes termos. Guardamos a versão que você aceitou.",
    body: (
      <>
        <p>Estes termos valem para todas as pessoas que usam o Domma Mart. Você os aceita ao criar uma conta ou ao concluir uma compra. O sistema registra a data e a versão aceita.</p>
        <p>
          Quem vende também aceita o <Link href="/termos/produtores">Contrato do Produtor</Link>. O tratamento dos seus dados pessoais está descrito na <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
        <p>Para criar uma conta de produtor é preciso ter 18 anos ou mais. Menores de 18 anos só podem comprar com a autorização e o acompanhamento de um responsável.</p>
      </>
    ),
  },
  {
    id: "conta",
    title: "Sua conta e o acesso sem senha",
    summary: "Não existe senha. Você entra com um código enviado ao seu e-mail. Nunca passe esse código a ninguém: o Domma Mart não pede código por telefone nem por WhatsApp.",
    body: (
      <>
        <p>O acesso é feito com o e-mail, o celular ou o CPF usado na compra ou no cadastro, e confirmado por um código de 6 dígitos enviado ao e-mail. O código vale por 10 minutos e só pode ser usado uma vez.</p>
        <p>Você é responsável por manter o seu e-mail seguro e por informar dados verdadeiros. Se perceber um acesso que não foi seu, avise a equipe {contactLine()}.</p>
        <p>
          Antes de pagar por um link que você recebeu, confira se ele é mesmo do Domma Mart em <Link href="/verificar-link">Este link é verdadeiro?</Link>
        </p>
      </>
    ),
  },
  {
    id: "compra",
    title: "Como funciona a compra",
    summary: "Você paga por Pix ou cartão, e o acesso é liberado assim que o pagamento é confirmado. O preço e os juros do parcelamento aparecem antes de você pagar.",
    body: (
      <>
        <p>O checkout mostra o produto, o produtor, o preço total, a forma de pagamento e, no cartão parcelado, o valor de cada parcela e o total com juros, antes da confirmação.</p>
        <ul>
          <li>
            <strong>Pix:</strong> o código tem prazo de validade indicado na tela. Depois do prazo, é só gerar outro.
          </li>
          <li>
            <strong>Cartão de crédito:</strong> a cobrança aparece na fatura com a identificação do Domma Mart ou do produtor. O Domma Mart não guarda o número completo do cartão.
          </li>
        </ul>
        <p>Com o pagamento confirmado, você recebe um e-mail com o botão de acesso, e o produto fica disponível em Minhas compras. O e-mail de acesso também serve como comprovante.</p>
        <p>O acesso é pessoal. Não é permitido compartilhar o login, revender o acesso nem copiar e distribuir o conteúdo, que pertence ao produtor.</p>
      </>
    ),
  },
  {
    id: "reembolso",
    title: "Garantia e reembolso",
    summary: "Toda compra tem pelo menos 7 dias de garantia. Dentro do prazo, o reembolso é automático e não depende do produtor.",
    body: (
      <>
        <p>
          Toda compra feita no Domma Mart tem garantia de <strong>no mínimo 7 dias</strong>, contados da confirmação do pagamento, como prevê o direito de arrependimento do Código de Defesa do Consumidor para compras feitas pela internet. O produtor pode oferecer um prazo maior, que aparece no checkout.
        </p>
        <p>Dentro do prazo de garantia, você pede o reembolso em Minhas compras, sem precisar explicar o motivo. O pedido é aprovado na hora e o acesso ao produto é encerrado.</p>
        <ul>
          <li>
            <strong>Pix:</strong> o valor volta no mesmo dia para a conta que fez o pagamento.
          </li>
          <li>
            <strong>Cartão:</strong> o estorno é enviado ao banco e aparece na fatura seguinte ou na próxima, conforme a data de fechamento. As parcelas que faltam são canceladas.
          </li>
        </ul>
        <p>Depois do prazo de garantia, você ainda pode pedir o reembolso. Nesse caso a decisão é do produtor, que responde em até 5 dias úteis. Seus direitos previstos em lei, como os casos de produto com defeito ou diferente do anunciado, continuam valendo depois da garantia.</p>
        <p>Você acompanha cada passo do reembolso em uma página própria, que mostra o que já aconteceu e de quem depende o próximo passo.</p>
      </>
    ),
  },
  {
    id: "atendimento",
    title: "Atendimento",
    summary: "A assistente do Domma Mart resolve o que é mais comum na hora. Quando precisa, uma pessoa da equipe responde em até 1 dia útil.",
    body: (
      <>
        <p>A página de Ajuda tem uma assistente de inteligência artificial que consulta as suas compras, reenvia o acesso e explica as regras. Ela é identificada como IA, pode errar e não decide reembolsos.</p>
        <p>Você pode pedir para falar com uma pessoa a qualquer momento. O prazo de resposta é de até 1 dia útil e aparece no seu pedido.</p>
        <p>Dúvidas sobre o conteúdo do produto, como aulas, materiais e certificados, são respondidas pelo produtor, pelo contato indicado no checkout e no e-mail de acesso.</p>
      </>
    ),
  },
  {
    id: "contestacao",
    title: "Contestação da compra no banco",
    summary: "Se houver um problema, fale com a gente antes de contestar no banco: o reembolso pela plataforma é mais rápido.",
    body: (
      <>
        <p>Se você não reconhece uma cobrança, confira primeiro em Minhas compras e, se ela não estiver lá, fale com a equipe pela página de Ajuda informando a data e o valor.</p>
        <p>Quando uma compra é contestada diretamente no banco do cartão, o valor fica separado até a decisão do banco, e o produtor pode apresentar provas de que entregou o produto. Se o banco decidir a favor do comprador, o valor é devolvido e o acesso é encerrado.</p>
      </>
    ),
  },
  {
    id: "proibido",
    title: "O que não é permitido",
    summary: "Fraude, uso do cartão de outra pessoa, pirataria e tentativa de burlar a plataforma levam ao bloqueio da conta.",
    body: (
      <>
        <p>Não é permitido:</p>
        <ul>
          <li>usar dados ou meios de pagamento de outra pessoa sem autorização;</li>
          <li>pedir reembolso de má-fé depois de copiar o conteúdo;</li>
          <li>copiar, gravar, compartilhar ou revender o conteúdo comprado;</li>
          <li>tentar acessar contas, dados ou áreas do sistema que não são suas;</li>
          <li>usar a plataforma para atividade ilegal.</li>
        </ul>
        <p>Nesses casos o Domma Mart pode suspender o acesso, cancelar compras e comunicar as autoridades. Sempre que uma conta é bloqueada, o motivo é informado por escrito e a pessoa pode contestar pela página de Ajuda.</p>
      </>
    ),
  },
  {
    id: "responsabilidade",
    title: "Responsabilidades",
    summary: "O produtor responde pelo conteúdo e pelo que promete. O Domma Mart responde pelo pagamento, pela entrega do acesso e pelo reembolso na garantia.",
    body: (
      <>
        <p>O produtor é responsável pelo conteúdo, pela qualidade, pelas promessas feitas na divulgação e pelo suporte do produto.</p>
        <p>O Domma Mart é responsável por processar o pagamento com segurança, liberar o acesso, cumprir a garantia de reembolso e proteger os seus dados. A plataforma trabalha para ficar disponível o tempo todo, mas pode ter interrupções para manutenção ou por falha de terceiros, como bancos e operadoras.</p>
        <p>Nada nestes termos reduz os direitos que a lei garante ao consumidor.</p>
      </>
    ),
  },
  {
    id: "mudancas",
    title: "Mudanças, lei aplicável e contato",
    summary: "Avisamos antes de mudar algo importante. Vale a lei brasileira, e o consumidor pode recorrer à Justiça da cidade onde mora.",
    body: (
      <>
        <p>Estes termos podem ser atualizados. Mudanças importantes são avisadas por e-mail ou no próprio site antes de valerem, e a versão em vigor fica sempre nesta página, com a data.</p>
        <p>Estes termos seguem a lei brasileira. Para compradores, fica garantido o foro do seu domicílio.</p>
        <p>Para falar com o Domma Mart, use a página de Ajuda ou escreva {contactLine()}.</p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Termos de Uso"
      current="/termos"
      intro={<p>Este documento explica, em linguagem simples, como o Domma Mart funciona para quem compra e para quem vende. Cada parte começa com um resumo; o texto completo vem logo abaixo.</p>}
      sections={sections}
    />
  );
}
