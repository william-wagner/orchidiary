# Armazenamento de fotos em objeto

Estudo de 22.X.2026. Trata do item **"Armazenamento de fotos no Amazon S3"** da Fase 4 do `docs/ROADMAP.md`.

> **Decisão de 22.X.2026:** o provedor será o **Amazon S3** (`sa-east-1`), e a troca fica para a **Fase 4**, junto com o cadastro de usuários. Agora não há necessidade, e o custo não se justifica para um usuário só. A recomendação original deste estudo (bucket do Lightsail) foi descartada; o resto da proposta técnica continua valendo, com os ajustes da seção 4.

Premissa: o app roda na AWS (Lightsail, `sa-east-1`, Docker na VM; ver `docs/INFRASTRUCTURE.md`). As soluções foram escolhidas para se encaixar nesse ambiente. Preços consultados em 22.X.2026, em dólar.

## 1. Como é hoje

- `services/storage.ts` define a interface `Storage` com `put(key, data)` e `get(key)`, e uma única implementação em disco (`STORAGE_DIR`, padrão `./data/photos`). O comentário do arquivo já prevê a troca por S3/R2.
- Na VM, as fotos ficam no bind `./apps/api/data` do container `app`, no SSD de 60 GB da instância (cerca de 7 GB em uso).
- Quem usa a interface:
  - `services/photos.ts`: grava a foto (WebP, até 2048 px, qualidade 82) e a miniatura (480 px, `.thumb.webp`).
  - `services/illustration.ts`: lê a foto de capa e grava a prancha e a miniatura dela.
  - `services/backup.ts`: lê cada foto ainda sem `driveFileId` e sobe para o Google Drive.
  - `routes/photos.ts`: `GET /api/photos/:id/file` confere o dono, lê do storage e devolve os bytes com `Cache-Control: private, max-age=31536000, immutable`.
- **Exceção:** `db/seedDemo.ts` apaga a pasta da planta FAKE direto no disco (`rm` em `STORAGE_DIR/<plantId>`), por fora da interface.
- Chaves: `<plantId>/<uuid>.webp`, gravadas em `photos.storage_key`, `thumb_key`, `illustration_key` e `illustration_thumb_key`. Cada upload gera uma chave nova; nenhum arquivo é sobrescrito. O app ainda não apaga fotos.
- Volume: 5,4 MB em produção (19.X.2026). Na base local, 40 fotos somam 5,7 MB: média de 128 KB por foto e 12 KB por miniatura.

### O que muda com a troca, de verdade

Pela capacidade, o disco ainda daria conta por anos. Os ganhos estão em outro lugar:

1. **As fotos deixam de depender da VM.** Hoje, se a instância se perder, as fotos só sobrevivem no backup semanal do Drive (os snapshots automáticos do Lightsail estão marcados "a confirmar" em `INFRASTRUCTURE.md`). Num bucket, elas ficam num armazenamento com durabilidade própria, e a VM vira descartável: recriar o servidor passa a ser só código, `.env` e banco.
2. **Deploy e troca de máquina ficam mais simples.** Não há mais pasta de fotos para copiar com `tar` numa migração.
3. **Prepara a Fase 4.** Com usuários públicos, o volume cresce e servir as imagens direto do bucket (ou de uma CDN) alivia a VM de 2 GB.

## 2. Opções no ambiente AWS

Estimativa de uso: cerca de 0,2 MB por foto somando foto, miniatura e uma parte das pranchas. Com 10 fotos por semana, são uns 100 MB por ano. Mesmo com o triplo disso, o uso fica abaixo de 5 GB por mais de uma década.

| | **A. Bucket do Lightsail** | **B. Amazon S3** (`sa-east-1`) | Referência: Cloudflare R2 |
|---|---|---|---|
| O que é | Armazenamento de objetos do próprio Lightsail, construído sobre o S3 | O S3 completo | S3-compatível fora da AWS |
| Preço | Plano fixo: US$ 1/mês (5 GB, 25 GB de saída); US$ 3 (100 GB, 250 GB); US$ 5 (250 GB, 500 GB) | US$ 0,0405 por GB-mês em São Paulo, mais requisições (centavos) | US$ 0,015 por GB-mês; 10 GB grátis; saída grátis |
| Além do plano | Armazenamento a US$ 0,023–0,025/GB; saída a US$ 0,15/GB em São Paulo | Saída: 100 GB/mês grátis somando toda a conta AWS | — |
| Custo em 1 GB | US$ 1,00 | ~US$ 0,04 | US$ 0 |
| Custo em 10 GB | ~US$ 1,13 (plano de 5 GB + excedente) | ~US$ 0,41 | US$ 0 |
| Custo em 100 GB | US$ 3,00 | ~US$ 4,05 | ~US$ 1,35 |
| Tráfego com a VM | Grátis entre bucket e instância na mesma região | A VM do Lightsail fica fora da rede do S3: a leitura tende a contar como saída (cabe nos 100 GB grátis) | Saída grátis |
| Acesso | Chave de acesso que só enxerga aquele bucket, ou instância anexada ao bucket | Usuário IAM com política escrita à mão | Token da Cloudflare |
| Versionamento | Sim | Sim, mais regras de ciclo de vida, replicação e Object Lock | Não equivalente |
| CDN | Distribuição do Lightsail (a partir de US$ 2,50/mês) | CloudFront (camada grátis generosa) | Embutida |
| Console | O mesmo da VM | Console da AWS, IAM | Outra conta, outro fornecedor |

### Leitura

- **A (Lightsail) é a que mais se encaixa no que já existe.** A VM, o IP estático e os snapshots estão no Lightsail. O bucket entra no mesmo console e na mesma fatura, e a chave de acesso já nasce restrita àquele bucket, sem escrever política IAM. O preço é fixo e previsível. A ressalva: a US$ 1/mês, é mais caro que o S3 puro no volume atual, e o Lightsail tem um conjunto de recursos mais enxuto (a documentação não cita ciclo de vida nem URL assinada).
- **B (S3) é o mais barato hoje e o mais completo.** Custa centavos no volume atual e tem tudo o que a Fase 4 pode pedir (CloudFront, ciclo de vida, Object Lock para proteger contra exclusão). Em troca, exige montar um usuário IAM com política mínima e acompanhar uma fatura variável.
- **R2 fica só como referência.** É o mais barato em escala e não cobra saída, mas sai da AWS. Como o código vai falar o protocolo S3 de qualquer forma, ele continua possível no futuro sem reescrever nada.

**Recomendação: A, bucket do Lightsail em São Paulo, plano de US$ 1.** É a opção que menos acrescenta peças novas à operação, e a diferença de preço é de menos de um dólar por mês. Como o bucket do Lightsail é S3 por baixo e o código usará o SDK do S3, passar para B ou para R2 depois é copiar objetos e trocar quatro variáveis do `.env`.

## 3. Proposta técnica

### 3.1 Interface

`Storage` ganha os métodos que faltam para um armazenamento remoto:

```ts
export interface Storage {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>; // usado pelo seed FAKE
}
```

Duas implementações, escolhidas por variável de ambiente:

- `LocalStorage`: a de hoje, sem mudança de comportamento. Continua o padrão em desenvolvimento.
- `S3Storage`: `@aws-sdk/client-s3`, que serve para o bucket do Lightsail, o S3 e o R2 (este com `S3_ENDPOINT`).

### 3.2 Chaves e banco

- **As chaves não mudam** (`<plantId>/<uuid>.webp`). O banco fica igual: nenhuma migração de schema.
- No bucket, o driver acrescenta um prefixo fixo (`S3_PREFIX`, padrão `photos/`), para deixar espaço para outros tipos de arquivo no futuro sem misturar.
- Como cada upload gera uma chave nova, os objetos são imutáveis. Por isso o cache `immutable` da rota continua correto.

### 3.3 Configuração

Novas variáveis no `.env` (e em `.env.example`, sem valores):

| Variável | Exemplo | Observação |
|---|---|---|
| `STORAGE_DRIVER` | `local` ou `s3` | padrão `local` |
| `S3_BUCKET` | `orchidiary-fotos` | |
| `S3_REGION` | `sa-east-1` | |
| `S3_ENDPOINT` | vazio | só para R2 ou MinIO |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | | chave do bucket |
| `S3_PREFIX` | `photos/` | |

- A chave do bucket fica no `.env`, junto com `POSTGRES_PASSWORD` e `SECRETS_KEY`: é configuração de infraestrutura, não uma integração configurada pelo master na tela de Ajustes. Por isso não passa pelo `saveIntegration`.
- **Por que não anexar a instância ao bucket:** o Lightsail permite dar acesso ao bucket sem chave, anexando a instância. A documentação não diz como a credencial chega à máquina. Se for pelo serviço de metadados da instância, um container Docker pode não alcançá-lo sem ajustar o limite de saltos (`update-instance-metadata-options`). A chave de acesso restrita ao bucket é mais simples e funciona igual no PC e na VM.

### 3.4 Como as fotos chegam ao app

- **Agora: a API continua entregando os bytes.** `GET /api/photos/:id/file` lê do bucket e responde como hoje. O front não muda, a checagem de dono continua na API, e o tráfego entre bucket e VM na mesma região é grátis no Lightsail.
- **Depois (Fase 4): redirecionar para URL assinada.** A rota responde `302` para uma URL temporária do bucket, e a VM deixa de carregar os bytes. Isso exige confirmar que o bucket do Lightsail aceita URL assinada do SDK (ele é S3 por baixo, mas a documentação do Lightsail não cita), e arredondar a validade para não perder o cache do navegador. Fica fora deste item.

### 3.5 Migração das fotos existentes

Script `pnpm storage:migrate` (em `apps/api/src/db/`), idempotente:

1. Lê do banco todas as chaves (`storage_key`, `thumb_key`, `illustration_key`, `illustration_thumb_key`).
2. Para cada uma: se o objeto já existe no bucket com o mesmo tamanho, pula; senão, sobe do disco.
3. Ao final, relata quantos subiram, quantos já estavam lá e quais chaves do banco não têm arquivo no disco.
4. Pode rodar quantas vezes for preciso, inclusive depois de trocar o driver.

Troca em produção:

1. Rodar o script com o app ainda em `local` (as fotos continuam saindo do disco).
2. Trocar `STORAGE_DRIVER=s3` e reiniciar. Rodar o script de novo para pegar o que chegou no meio.
3. Manter a pasta `apps/api/data/photos` na VM por 30 dias como volta. Para desfazer, basta voltar o driver para `local`, desde que nenhuma foto nova tenha entrado; se entrou, o mesmo script ao contrário traz de volta.
4. Depois dos 30 dias, apagar a pasta e tirar o bind de fotos do `docker-compose.yml` (os logs continuam em `data/logs`).

### 3.6 Backup, desenvolvimento e segurança

- **Backup no Google Drive continua.** Ele lê pela interface, então funciona igual com o bucket. É a cópia fora da AWS, e por isso vale manter.
- **Versionamento ligado no bucket.** Como nada é sobrescrito, o custo extra é quase zero. Ele protege contra uma exclusão por engano quando o app passar a apagar fotos.
- **Bucket privado**, sem objetos públicos. O EXIF já é removido antes de gravar.
- **Desenvolvimento:** `local` continua o padrão. O seed FAKE passa a apagar por `storage.deletePrefix` e se recusa a rodar com `STORAGE_DRIVER=s3`, para nunca apagar nada no bucket de produção. Para testar o driver S3 no PC, um MinIO opcional no `docker-compose.dev.yml` ou um bucket de teste separado.

## 4. Decisões

| # | Decisão | Proposta |
|---|---|---|
| 1 | Provedor | **Decidido: Amazon S3 em `sa-east-1`, na Fase 4** (o estudo propunha o bucket do Lightsail) |
| 2 | Acesso | Usuário IAM só com acesso ao bucket (`s3:GetObject`, `PutObject`, `DeleteObject`, `ListBucket` no prefixo), chave no `.env` |
| 3 | Entrega das fotos | Como a troca já será na Fase 4, avaliar começar direto pelo redirecionamento para URL assinada (ou CloudFront): no S3, a leitura pela VM do Lightsail conta como saída |
| 4 | Chaves | Iguais às de hoje, com prefixo `photos/` no bucket |
| 5 | Versionamento | Ligado |
| 6 | Volta | Pasta local mantida por 30 dias |
| 7 | Desenvolvimento | `local` por padrão; MinIO opcional |

## 5. Tarefas (uma por commit)

1. Interface: `exists`, `delete`, `deletePrefix` e o tipo do conteúdo; `LocalStorage` com os métodos novos; escolha do driver por `STORAGE_DRIVER` em `env.ts`; seed FAKE passando pela interface e bloqueado com `s3`.
2. `S3Storage` com `@aws-sdk/client-s3` e as variáveis novas; teste contra MinIO ou bucket de teste.
3. Script `pnpm storage:migrate`, idempotente e com relatório.
4. Infraestrutura: criar o bucket e a chave no Lightsail, ligar o versionamento, preencher o `.env` da VM, rodar a migração e trocar o driver; atualizar `docs/INFRASTRUCTURE.md` (diagrama, variáveis, backup e migração de dados).
5. Depois de 30 dias: apagar as fotos do disco da VM e o bind correspondente.

## 6. A verificar na implementação

- Se o bucket do Lightsail aceita as chamadas do SDK do S3 usadas (`PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, `ListObjectsV2`) com a chave restrita. A documentação diz que ele é construído sobre o S3, mas não detalha a API.
- Se os snapshots automáticos da instância estão ligados (já marcado como "a confirmar" na infraestrutura). Com as fotos no bucket, eles passam a proteger só o banco e a configuração.

## Fontes

- [Object storage and buckets — Amazon Lightsail (FAQ)](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-buckets.html)
- [Buckets in Amazon Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/buckets-in-amazon-lightsail.html)
- [Control access to Lightsail buckets for instances](https://docs.aws.amazon.com/en_us/lightsail/latest/userguide/amazon-lightsail-configuring-bucket-resource-access.html)
- [Data transfer in Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html)
- [Amazon Lightsail pricing](https://aws.amazon.com/lightsail/pricing)
- [aws lightsail update-instance-metadata-options](https://docs.aws.amazon.com/cli/latest/reference/lightsail/update-instance-metadata-options.html)
- [AWS S3 Pricing Explained (2026)](https://upstash.com/blog/aws-s3-pricing-explained-2026)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
