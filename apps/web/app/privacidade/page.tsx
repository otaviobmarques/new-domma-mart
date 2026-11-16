import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal-doc";
import { companyLine, dpoLine } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Privacidade", description: "Quais dados o Domma Mart usa, para quê, com quem compartilha e como você exerce os seus direitos.", alternates: { canonical: "/privacidade" } };

const sections: LegalSection[] = [
  {
    id: "quem",
    title: "Quem cuida dos seus dados",
    summary: "O Domma Mart é responsável pelos dados da sua conta e da sua compra. O produtor recebe só o necessário para entregar o produto e dar suporte.",
    body: (
      <>
        <p>O Domma Mart é operado por {companyLine()}, que é a controladora dos dados pessoais tratados na plataforma, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
        <p>Quando você compra um produto, o produtor recebe o seu nome, e-mail e telefone para entregar o produto e prestar suporte. Para essas finalidades, o produtor também é responsável pelo uso que faz desses dados e não pode usá-los para outros fins sem o seu consentimento.</p>
        <p>O encarregado pelo tratamento de dados pessoais atende {dpoLine()}.</p>
      </>
    ),
  },
  {
    id: "quais",
    title: "Quais dados usamos",
    summary: "Só o necessário para a compra, o acesso, o pagamento e a segurança. Não guardamos o número completo do seu cartão.",
    body: (
      <>
        <ul>
          <li>
            <strong>Cadastro e compra:</strong> nome, e-mail, celular e CPF.
          </li>
          <li>
            <strong>Pagamento:</strong> forma de pagamento, valor, parcelas e os quatro últimos dígitos do cartão. Os dados completos do cartão são tratados pelo provedor de pagamento e não ficam guardados no Domma Mart.
          </li>
          <li>
            <strong>Uso do produto:</strong> aulas concluídas e o ponto em que você parou em cada vídeo.
          </li>
          <li>
            <strong>Atendimento:</strong> mensagens trocadas com a assistente e com a equipe.
          </li>
          <li>
            <strong>Segurança:</strong> endereço de IP, data e hora de acesso, tipo de navegador e registros de ações importantes na conta.
          </li>
          <li>
            <strong>Produtores:</strong> além dos dados acima, CPF ou CNPJ, chave Pix, foto de um documento oficial e selfie para a verificação de identidade, e os dados de vendas, saldo e saques.
          </li>
        </ul>
        <p>O CPF, o CNPJ e a chave Pix são guardados com criptografia. Os documentos e as selfies ficam em área privada, sem endereço público, e cada abertura pela equipe fica registrada.</p>
      </>
    ),
  },
  {
    id: "para-que",
    title: "Para que usamos e com qual base legal",
    summary: "Para cumprir a venda, cumprir a lei e proteger você e a plataforma contra fraude. Não vendemos seus dados.",
    body: (
      <>
        <ul>
          <li>
            <strong>Processar a compra, liberar o acesso, reembolsar e atender você:</strong> execução do contrato.
          </li>
          <li>
            <strong>Guardar registros fiscais e financeiros, verificar a identidade de produtores e responder a autoridades:</strong> cumprimento de obrigação legal e regulatória.
          </li>
          <li>
            <strong>Prevenir fraude, contestações indevidas e uso indevido da conta, e manter a plataforma segura:</strong> legítimo interesse e garantia da prevenção à fraude.
          </li>
          <li>
            <strong>Defender direitos em processos e em contestações de pagamento:</strong> exercício regular de direitos.
          </li>
          <li>
            <strong>Enviar avisos sobre a sua conta e a sua compra, como código de acesso, acesso liberado e andamento do reembolso:</strong> execução do contrato. Esses e-mails não são publicidade.
          </li>
        </ul>
        <p>O Domma Mart não vende dados pessoais e não os usa para publicidade de terceiros.</p>
      </>
    ),
  },
  {
    id: "ia",
    title: "Uso de inteligência artificial",
    summary: "Usamos IA no atendimento e na primeira análise de produtos. Decisões que afetam você, como recusar um produto ou bloquear uma conta, são sempre de uma pessoa.",
    body: (
      <>
        <p>A assistente da página de Ajuda é uma inteligência artificial. Para responder, ela recebe as mensagens da conversa e os dados das suas compras necessários para o atendimento, como produto, forma de pagamento, situação do acesso e do reembolso. Ela é identificada como IA e você pode pedir uma pessoa a qualquer momento.</p>
        <p>Produtores também contam com IA para montar o cadastro de um produto, e os produtos passam por uma triagem automática antes da publicação. Recusas, pedidos de correção e bloqueios são sempre decididos por uma pessoa da equipe, com o motivo por escrito, e podem ser contestados.</p>
        <p>Você pode pedir a revisão de qualquer decisão tomada com apoio de tratamento automatizado.</p>
      </>
    ),
  },
  {
    id: "com-quem",
    title: "Com quem compartilhamos",
    summary: "Com o produtor de quem você comprou e com as empresas que fazem a plataforma funcionar: pagamento, e-mail, hospedagem e IA. Alguns ficam fora do Brasil.",
    body: (
      <>
        <ul>
          <li>
            <strong>Produtor:</strong> nome, e-mail, telefone e dados da compra, para entrega e suporte.
          </li>
          <li>
            <strong>Provedor de pagamento, bancos e bandeiras:</strong> dados necessários para cobrar, reembolsar e tratar contestações.
          </li>
          <li>
            <strong>Serviço de envio de e-mails:</strong> seu endereço de e-mail e o conteúdo das mensagens da plataforma.
          </li>
          <li>
            <strong>Hospedagem do site, do banco de dados e dos arquivos:</strong> armazenam os dados em nome do Domma Mart.
          </li>
          <li>
            <strong>Fornecedor do modelo de inteligência artificial:</strong> o conteúdo das conversas com a assistente e as descrições de produtos enviadas para análise.
          </li>
          <li>
            <strong>Autoridades:</strong> quando houver obrigação legal ou ordem judicial.
          </li>
        </ul>
        <p>Parte desses fornecedores trata os dados em outros países, como os Estados Unidos. Nesses casos, o Domma Mart usa fornecedores que assumem compromissos contratuais de proteção de dados compatíveis com a lei brasileira.</p>
      </>
    ),
  },
  {
    id: "tempo",
    title: "Por quanto tempo guardamos",
    summary: "Pelo tempo em que a conta existir e, depois, pelo prazo que a lei exige para registros de pagamento e fiscais.",
    body: (
      <>
        <ul>
          <li>
            <strong>Dados da conta e das compras:</strong> enquanto a conta estiver ativa e, depois, pelos prazos legais de guarda de registros fiscais, financeiros e de defesa em processos, em geral de 5 anos.
          </li>
          <li>
            <strong>Registros de acesso:</strong> pelo menos 6 meses, como determina o Marco Civil da Internet.
          </li>
          <li>
            <strong>Documentos e selfie da verificação de identidade:</strong> enquanto a conta de produtor estiver ativa e, depois, pelo prazo exigido pelas regras de prevenção à fraude e à lavagem de dinheiro.
          </li>
          <li>
            <strong>Códigos de acesso e links enviados por e-mail:</strong> apagados dos nossos registros assim que a mensagem é enviada.
          </li>
        </ul>
        <p>Ao fim dos prazos, os dados são apagados ou tornados anônimos.</p>
      </>
    ),
  },
  {
    id: "direitos",
    title: "Seus direitos",
    summary: "Você pode ver, corrigir, levar ou pedir a exclusão dos seus dados. Respondemos em até 15 dias.",
    body: (
      <>
        <p>A qualquer momento, você pode pedir:</p>
        <ul>
          <li>a confirmação de que tratamos seus dados e o acesso a eles;</li>
          <li>a correção de dados incompletos, errados ou desatualizados;</li>
          <li>a exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>a portabilidade dos seus dados;</li>
          <li>a informação sobre com quem os dados foram compartilhados;</li>
          <li>a revisão de decisões tomadas com base em tratamento automatizado;</li>
          <li>a oposição a um tratamento que considere irregular.</li>
        </ul>
        <p>
          O pedido é feito pela <Link href="/ajuda">página de Ajuda</Link> ou diretamente ao encarregado, {dpoLine()}. A resposta sai em até 15 dias. Alguns dados não podem ser apagados enquanto durar a obrigação legal de guardá-los, como os registros de pagamento.
        </p>
        <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    summary: "Usamos só os cookies necessários para o site funcionar, como o que mantém você conectado. Não há cookies de publicidade.",
    body: (
      <>
        <p>O Domma Mart usa cookies e armazenamento do navegador estritamente necessários: para manter a sua sessão, lembrar a preferência de tema claro ou escuro e fazer o aplicativo funcionar no celular. Não usamos cookies de publicidade nem de rastreamento entre sites.</p>
        <p>Nas páginas de pagamento de um produto, o produtor pode identificar a origem da venda pelos parâmetros do link de divulgação. Essa informação fica ligada à compra e não é usada para acompanhar você em outros sites.</p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança",
    summary: "Dados sensíveis são criptografados, o acesso é registrado e cada conta só enxerga o que é dela.",
    body: (
      <>
        <p>Entre as medidas adotadas: conexão criptografada em todo o site, criptografia de CPF, CNPJ e chave Pix, separação dos dados de cada conta no próprio banco de dados, arquivos privados com endereços que vencem, confirmação por código para saques e trocas de chave Pix, e registro de quem acessa o quê na equipe.</p>
        <p>Nenhum sistema é totalmente imune. Se ocorrer um incidente que possa trazer risco ou dano relevante, o Domma Mart avisa as pessoas afetadas e a ANPD, como a lei determina.</p>
      </>
    ),
  },
  {
    id: "mudancas",
    title: "Mudanças nesta política",
    summary: "A versão em vigor fica sempre nesta página. Mudanças importantes são avisadas antes de valerem.",
    body: <p>Esta política pode ser atualizada para refletir mudanças na plataforma ou na lei. Mudanças importantes são avisadas por e-mail ou no site antes de valerem. A data e a versão aparecem no topo desta página.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Política de Privacidade"
      current="/privacidade"
      intro={<p>Esta política explica quais dados pessoais o Domma Mart usa, para quê, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos. Cada parte começa com um resumo.</p>}
      sections={sections}
    />
  );
}
