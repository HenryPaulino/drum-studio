# Drum Studio

### Sua música. Seu ritmo. Seu espaço.

O **Drum Studio** reúne em um só lugar as ferramentas que ajudam você a estudar, praticar e evoluir na música. Organize seu repertório, acompanhe partituras e pratique no seu ritmo — no computador, tablet ou celular.

## Tudo para sua próxima sessão de estudo

- **Metrônomo:** marque o tempo e pratique com mais precisão.
- **Afinador cromático:** afine seu instrumento usando o microfone do dispositivo.
- **Biblioteca musical:** organize suas músicas e referências do Spotify e YouTube.
- **Partituras:** importe, visualize e exporte arquivos MusicXML para bateria, sopros e outros instrumentos.
- **Repertório local:** organize músicas e referências do Spotify e YouTube no seu dispositivo.
- **Seu jeito de estudar:** use tema claro ou escuro, com uma interface que se adapta a telas pequenas.

### Menos tempo procurando. Mais tempo tocando.

Do primeiro compasso à próxima música do repertório, o Drum Studio ajuda você a manter tudo à mão e aproveitar melhor cada sessão de estudo.

## Experimente no seu computador

```sh
npm install
npm run dev
```

Para gerar a versão de produção:

```sh
npm run build
```

## Cópia de segurança gratuita no Google Drive

As partituras importadas são mantidas no armazenamento local do navegador. Para criar uma cópia na sua conta Google Drive e restaurá-la em outro dispositivo, configure o login Google:

1. No Google Cloud Console, crie um projeto e habilite a **Google Drive API**.
2. Configure a tela de consentimento OAuth e crie um **OAuth Client ID** do tipo aplicação Web. Adicione `http://localhost:5173` e `https://henrypaulino.github.io` como origens JavaScript autorizadas.
3. Configure `VITE_GOOGLE_CLIENT_ID` em `.env` para desenvolvimento. No GitHub, adicione o mesmo valor como secret `VITE_GOOGLE_CLIENT_ID` em **Settings → Secrets and variables → Actions**.
4. Em **Partituras**, conecte a conta Google associada ao YouTube. Use o botão de nuvem ao lado de uma partitura para enviá-la; conecte a mesma conta em outro dispositivo para restaurá-la.

O app solicita o escopo `drive.file`, limitado aos arquivos criados pelo próprio Drum Studio. As cópias ficam visíveis no seu Google Drive e usam o espaço disponível da sua conta; não há banco de dados ou armazenamento pago do app. O token de acesso fica apenas na memória da página e é solicitado novamente quando necessário. A cópia local e a cópia no Drive são independentes. A Google Drive API está sujeita às cotas do Google.

O login Google identifica sua conta e permite o backup; não dá acesso para baixar nem transcrever o áudio do YouTube ou Spotify. Para criar/importar uma partitura, use arquivos MusicXML que você criou ou tem autorização para usar.

## Publicação HTTPS no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o app quando há um push para `main` ou `principal`. O endereço padrão deste repositório é `https://henrypaulino.github.io/drum-studio/`.

1. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como origem da publicação.
2. Em **Settings → Secrets and variables → Actions**, crie o secret `VITE_GOOGLE_CLIENT_ID` com o OAuth Client ID do Google. Sem ele, o site publica, mas login e cópia de segurança no Drive ficam desativados.
3. Faça push para `main` ou `principal`, ou execute **Actions → Deploy to GitHub Pages → Run workflow**. O primeiro deploy pode levar alguns minutos.
4. No projeto Google Cloud, adicione `https://henrypaulino.github.io` às origens JavaScript autorizadas do OAuth Client ID.

O Vite usa o caminho `/drum-studio/` somente no workflow do GitHub Pages; desenvolvimento local e outros builds continuam usando `/`.
