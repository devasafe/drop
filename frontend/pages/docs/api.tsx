import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from './ApiDocs.module.css';

function Code({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(children).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <div className={styles.codeWrap}>
      {lang && <span className={styles.codeLang}>{lang}</span>}
      <button type="button" className={styles.copyBtn} onClick={copy}>{copied ? 'Copiado!' : 'Copiar'}</button>
      <pre className={styles.pre}><code>{children}</code></pre>
    </div>
  );
}

export default function ApiDocs() {
  // client-only (evita mismatch de hidratação com valores derivados de window).
  const [base, setBase] = useState('https://SEU_HOST/api');
  useEffect(() => {
    if (typeof window !== 'undefined') setBase(`${window.location.origin}/api`);
  }, []);

  return (
    <div className={styles.page}>
      <Head><title>API de Estoque — DROP</title></Head>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo}>DR<span className={styles.o}>O</span>P</div>
          <h1 className={styles.title}>API de Estoque</h1>
          <p className={styles.subtitle}>Exporte e sincronize o estoque da sua loja em tempo real — puxando via API ou recebendo webhooks quando algo muda.</p>
        </header>

        {/* Visão geral */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Visão geral</h2>
          <p>Há duas formas de integrar (pode usar as duas juntas):</p>
          <ul className={styles.list}>
            <li><strong>Pull (você puxa):</strong> seu sistema chama a API quando quiser e recebe o estoque atual. Simples e à prova de falhas.</li>
            <li><strong>Webhook (a gente avisa):</strong> quando o estoque muda no DROP (venda, cancelamento, ajuste), enviamos um <code>POST</code> assinado pra uma URL sua.</li>
            <li><strong>Write (você atualiza):</strong> vendeu fora do DROP? Mande a baixa pra cá pela API. É a integração <strong>bidirecional</strong> — os dois lados sempre batem.</li>
          </ul>
          <p className={styles.note}>Recomendação: comece pelo <strong>pull</strong> (faz a sincronização inicial e a reconciliação). Ligue o <strong>webhook</strong> depois pra reagir na hora às mudanças.</p>
        </section>

        {/* Autenticação */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Autenticação</h2>
          <p>No painel da loja em <strong>Integrações (API)</strong>, clique em <strong>Gerar chave</strong>. A chave (<code>dk_…</code>) aparece <strong>uma única vez</strong> — copie e guarde num lugar seguro (guardamos só o hash, não é recuperável).</p>
          <p>Envie a chave no cabeçalho <code>Authorization</code> em toda requisição:</p>
          <Code lang="HTTP">{`Authorization: Bearer dk_suachave...`}</Code>
          <p className={styles.note}>A chave é <strong>read-only</strong> e só enxerga os produtos da <strong>sua</strong> loja. Se vazar, revogue no painel e gere outra.</p>
        </section>

        {/* Puxar estoque */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Puxar o estoque (pull)</h2>
          <Code lang="cURL">{`curl -H "Authorization: Bearer dk_suachave..." \\
  ${base}/integrations/v1/products`}</Code>
          <p>Resposta (JSON):</p>
          <Code lang="JSON">{`{
  "store_id": "abc123",
  "count": 2,
  "products": [
    { "id": "p1", "name": "iPhone 16", "quantity": 3, "price": 4000, "available": true, "updated_at": "2026-08-24T12:00:00.000Z" },
    { "id": "p2", "name": "Galaxy S3", "quantity": 0, "price": 1500, "available": false, "updated_at": "2026-08-24T11:00:00.000Z" }
  ]
}`}</Code>
          <p>Precisa de planilha? Use <code>?format=csv</code>:</p>
          <Code lang="cURL">{`curl -H "Authorization: Bearer dk_suachave..." \\
  "${base}/integrations/v1/products?format=csv" -o estoque.csv`}</Code>
          <table className={styles.table}>
            <thead><tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr></thead>
            <tbody>
              <tr><td><code>id</code></td><td>string</td><td>Identificador do produto na DROP</td></tr>
              <tr><td><code>name</code></td><td>string</td><td>Nome do produto</td></tr>
              <tr><td><code>quantity</code></td><td>number</td><td>Estoque atual</td></tr>
              <tr><td><code>price</code></td><td>number</td><td>Preço (BRL)</td></tr>
              <tr><td><code>available</code></td><td>boolean</td><td><code>quantity &gt; 0</code></td></tr>
              <tr><td><code>updated_at</code></td><td>ISO 8601</td><td>Última atualização do produto</td></tr>
            </tbody>
          </table>
        </section>

        {/* Atualizar estoque (write) */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Atualizar o estoque (write)</h2>
          <p>Vendeu na loja física ou em outro canal? Avise o DROP pra não vender a mais. Duas formas:</p>
          <ul className={styles.list}>
            <li><strong>Delta (recomendado):</strong> <code>{'{ "adjust": -2 }'}</code> — "saíram 2" (piso em 0). Compõe certinho com as vendas do próprio DROP.</li>
            <li><strong>Absoluto:</strong> <code>{'{ "quantity": 5 }'}</code> — "o estoque agora é 5" (use quando o seu sistema é o dono da verdade).</li>
          </ul>
          <p>Um produto:</p>
          <Code lang="cURL">{`curl -X PATCH -H "Authorization: Bearer dk_suachave..." \\
  -H "Content-Type: application/json" \\
  -d '{"adjust": -2}' \\
  ${base}/integrations/v1/products/PRODUCT_ID/stock`}</Code>
          <p>Vários de uma vez (sync em lote, até 500):</p>
          <Code lang="cURL">{`curl -X PATCH -H "Authorization: Bearer dk_suachave..." \\
  -H "Content-Type: application/json" \\
  -d '{"updates":[{"id":"p1","adjust":-2},{"id":"p2","quantity":10}]}' \\
  ${base}/integrations/v1/products/stock`}</Code>
          <p className={styles.note}>Ciclo completo: venda no DROP → você recebe o webhook e baixa no seu sistema; venda fora do DROP → você manda o delta pra cá. Os dois lados sempre batem. As atualizações vindas pela API <strong>não</strong> geram webhook de volta (evita eco).</p>
        </section>

        {/* Webhooks */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Webhooks (push)</h2>
          <p>No painel, cadastre uma <strong>URL</strong> que recebe <code>POST</code>. Guardamos um <strong>secret</strong> (mostrado uma vez) usado pra assinar cada entrega. Quando o estoque muda, enviamos:</p>
          <Code lang="HTTP">{`POST https://seu-sistema.com/webhooks/drop
Content-Type: application/json
X-Drop-Event: stock.updated
X-Drop-Signature: sha256=<hmac_do_corpo>

{
  "event": "stock.updated",
  "store_id": "abc123",
  "products": [{ "id": "p1", "name": "iPhone 16", "quantity": 3, "price": 4000 }],
  "occurred_at": "2026-08-24T12:00:00.000Z"
}`}</Code>
          <p><strong>Sempre valide a assinatura</strong>: calcule o HMAC-SHA256 do <em>corpo cru</em> usando o seu secret e compare com o header <code>X-Drop-Signature</code>. Responda <code>2xx</code> rápido (reentregamos em falha e desativamos o webhook após muitas falhas seguidas).</p>
          <p className={styles.note}>Dica: trate o webhook como um "aviso" e, na dúvida, puxe o estado atual pelo endpoint de estoque (fonte da verdade). Assim você nunca fica dessincronizado se perder um evento.</p>
        </section>

        {/* Para devs */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Para desenvolvedores</h2>

          <h3 className={styles.h3}>Node.js — puxar o estoque</h3>
          <Code lang="Node.js">{`const res = await fetch("${base}/integrations/v1/products", {
  headers: { Authorization: "Bearer " + process.env.DROP_API_KEY },
});
if (!res.ok) throw new Error("HTTP " + res.status);
const { products } = await res.json();
console.log(products);`}</Code>

          <h3 className={styles.h3}>Node.js — dar baixa no estoque (venda fora do DROP)</h3>
          <Code lang="Node.js">{`// vendeu 2 unidades do produto na loja física:
await fetch("${base}/integrations/v1/products/PRODUCT_ID/stock", {
  method: "PATCH",
  headers: {
    Authorization: "Bearer " + process.env.DROP_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ adjust: -2 }),
});`}</Code>

          <h3 className={styles.h3}>Node.js (Express) — receber e validar o webhook</h3>
          <Code lang="Node.js">{`import express from "express";
import crypto from "crypto";

const app = express();
// precisa do corpo CRU pra validar a assinatura:
app.use("/webhooks/drop", express.raw({ type: "application/json" }));

app.post("/webhooks/drop", (req, res) => {
  const signature = req.header("X-Drop-Signature") || "";
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.DROP_WEBHOOK_SECRET)
    .update(req.body) // Buffer cru
    .digest("hex");

  const ok = signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!ok) return res.status(401).send("assinatura inválida");

  const payload = JSON.parse(req.body.toString());
  // payload.event === "stock.updated" → atualize seu sistema
  res.sendStatus(200);
});`}</Code>

          <h3 className={styles.h3}>Python — validar o webhook</h3>
          <Code lang="Python">{`import hmac, hashlib

def valido(corpo_cru: bytes, header_assinatura: str, secret: str) -> bool:
    esperado = "sha256=" + hmac.new(secret.encode(), corpo_cru, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, header_assinatura or "")`}</Code>
        </section>

        {/* Erros */}
        <section className={styles.section}>
          <h2 className={styles.h2}>Erros e limites</h2>
          <ul className={styles.list}>
            <li><code>401</code> — chave ausente, inválida ou revogada.</li>
            <li>Se você fizer <em>polling</em>, um intervalo de <strong>1–5 min</strong> costuma ser suficiente (o pull é sempre o dado atual).</li>
            <li>Webhook que falha muitas vezes seguidas é <strong>desativado</strong> — reative recadastrando.</li>
          </ul>
        </section>

        <footer className={styles.footer}>DROP · API de Estoque</footer>
      </div>
    </div>
  );
}
