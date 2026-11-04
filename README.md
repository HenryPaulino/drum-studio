# Drum Studio

App de estudo musical para celular, tablet e desktop, com versão web e preparação para iOS com Capacitor.

## Recursos atuais

- Metrônomo com BPM, compasso, subdivisão e volume.
- Afinador cromático pelo microfone do dispositivo. O áudio é analisado localmente.
- Biblioteca de referências com links do Spotify e YouTube.
- Importação, visualização e exportação de partituras MusicXML para bateria, saxofone, flauta e outros instrumentos.
- Repertório local de louvores ICM, com busca e associação de partituras aos louvores e instrumentos.
- Catálogo comunitário online de louvores e partituras MusicXML, com autenticação e aprovação antes da publicação.
- Tema claro/escuro e navegação adaptada a telas pequenas.

As referências do Spotify/YouTube abrem os serviços originais. A aplicação não baixa nem transcreve áudio desses serviços. Para visualizar partituras, importe um arquivo MusicXML que você tenha autorização para usar. Dados e partituras ficam armazenados localmente no navegador e não são sincronizados entre dispositivos.

Para organizar partituras de bateria de louvores ICM, cadastre o louvor na biblioteca e use o botão de partitura ao lado dele. O importador seleciona bateria e associa o MusicXML ao louvor; depois você pode buscar e filtrar o repertório por instrumento. O app não inclui nem transcreve partituras protegidas: use arquivos que você criou ou tem autorização para utilizar.

## Catálogo online compartilhado

O catálogo compartilhado usa Supabase (Postgres, autenticação e armazenamento privado de arquivos). Configure-o antes de executar/publicar o app:

1. Crie um projeto Supabase e execute `supabase/migrations/20261104000000_shared_catalog.sql` no SQL Editor.
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com as credenciais públicas do projeto. Nunca coloque uma `service_role` key no app.
3. Crie uma conta no catálogo e confirme o e-mail. Para promover o primeiro moderador, encontre o UUID dessa conta em Authentication → Users e rode no SQL Editor: `insert into public.catalog_admins (user_id) values ('UUID-DO-MODERADOR');`.
4. Moderadores analisam envios em Table Editor. Para publicar, altere `status` de `pending` para `approved` em `songs` e `scores`; para recusar, use `rejected`. Somente itens aprovados aparecem no catálogo público. Os arquivos ficam em bucket privado e as políticas RLS controlam o acesso.
5. Ao compilar a versão iOS, use as mesmas variáveis de ambiente antes de `npm run ios:sync`.

Sem essas credenciais, a aba Catálogo ICM informa que o serviço ainda não foi conectado; recursos locais continuam disponíveis. O Supabase precisa permanecer hospedado e acessível para que todos os usuários compartilhem o catálogo. A conta gratuita possui cotas e pode exigir upgrade conforme o uso.

## Desenvolvimento

Requer Node.js `^22.18.0` ou `>=24.12.0`.

```sh
npm install
npm run dev
```

Para validar e gerar a versão de produção:

```sh
npm run build
```

O acesso ao afinador requer permissão de microfone e contexto seguro (HTTPS, ou localhost durante o desenvolvimento).

## Preparar para iPhone e iPad

A versão iOS usa Capacitor e precisa ser compilada em um Mac com Xcode:

1. Instale as dependências com `npm install`.
2. Gere o projeto iOS uma vez com `npm run ios:add`.
3. Para atualizar o app nativo depois de alterar o site, rode `npm run ios:sync`.
4. Abra o projeto no Xcode com `npm run ios:open`, configure assinatura/equipe Apple e teste em iPhone e iPad.
5. No Xcode, arquive e envie a versão pelo App Store Connect para revisão da Apple.

O identificador iOS configurado é `com.henrypaulino.drumstudio`; confirme que ele está disponível e pertence à sua conta Apple antes de publicar. A publicação requer uma conta Apple Developer ativa, metadados e capturas de tela do app, além da revisão e aprovação da Apple. Este repositório não contém credenciais nem certificados de assinatura.
