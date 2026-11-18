# Drum Studio

### Sua música. Seu ritmo. Seu espaço.

O **Drum Studio** reúne em um só lugar as ferramentas que ajudam você a estudar, praticar e evoluir na música. Organize seu repertório, acompanhe partituras e pratique no seu ritmo — no computador, tablet ou celular.

## Tudo para sua próxima sessão de estudo

- **Metrônomo:** marque o tempo e pratique com mais precisão.
- **Afinador cromático:** afine seu instrumento usando o microfone do dispositivo.
- **Biblioteca musical:** organize suas músicas e referências do Spotify e YouTube.
- **Partituras interativas:** importe MusicXML, acompanhe o cursor durante a reprodução e controle o mini player, a velocidade e a repetição dentro do app.
- **Catálogo compartilhado:** explore estudos originais de bateria, baixo, violão e teclado, filtre por instrumento/estilo/nível e visualize partituras sem login.
- **Biblioteca pessoal:** músicas e partituras são privadas da conta Google conectada e sincronizadas pelo Drive.
- **Ritmos de bateria:** monte bumbo, caixa, chimbal, tons e pratos numa grade e gere uma partitura MusicXML.
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

## Conta e armazenamento por usuário

O catálogo público é incluído com o próprio app e contém estudos originais para bateria, baixo, violão e teclado. As partituras podem ser visualizadas e reproduzidas dentro do Drum Studio; não é necessário abrir um serviço externo para praticar esses estudos. O catálogo não exige conta nem serviço de armazenamento, é curado no código, atualizado junto com novas versões e não aceita envios públicos de usuários. O login Google é usado somente para a biblioteca pessoal: não há senha própria do Drum Studio nem serviço de hospedagem de arquivos do app. Cada pessoa tem sua própria biblioteca no Drive, e seus arquivos não são compartilhados com outros usuários. Para configurar:

1. No Google Cloud Console, crie um projeto e habilite a **Google Drive API**.
2. Configure a tela de consentimento OAuth e crie um **OAuth Client ID** do tipo aplicação Web. Adicione `http://localhost:5173` e `https://henrypaulino.github.io` como origens JavaScript autorizadas.
3. Configure `VITE_GOOGLE_CLIENT_ID` em `.env` para desenvolvimento. No GitHub, adicione o mesmo valor como secret `VITE_GOOGLE_CLIENT_ID` em **Settings → Secrets and variables → Actions**.
4. No app, abra **Músicas** ou **Partituras** e entre com a conta Google que será dona da biblioteca. Músicas e partituras importadas ou criadas são sincronizadas nessa conta; ao entrar com a mesma conta em outro dispositivo, a biblioteca é carregada automaticamente.

O app solicita o escopo `drive.file`, limitado aos arquivos que ele cria no Drive. O app não paga por armazenamento: cada usuário usa a quota disponível na própria conta Google. Se a quota ou a cota de API for atingida, a sincronização falha até haver espaço ou quota disponível; o app não ativa faturamento automático. O token fica apenas na memória da página, então pode ser necessário entrar novamente ao reabrir o app.

O player usa síntese de áudio local e as partituras do catálogo ou enviadas pelo usuário; o cursor acompanha a execução e o mini player permite controlar a reprodução enquanto a partitura está aberta. Ele não reproduz gravações nem inclui partituras ou catálogo do Songsterr. O catálogo inicial oferece estudos curtos originais; importe MusicXML que você criou ou tem autorização para usar para ampliar sua biblioteca pessoal. O app não baixa nem transcreve áudio do YouTube ou Spotify.

O código não usa Firebase. Se o projeto Firebase criado anteriormente ainda tiver um bucket ou faturamento ativo, remover a integração do app não cancela esses recursos: exclua o bucket e desvincule a conta de faturamento no console do Google Cloud/Firebase para evitar cobranças futuras.

## Publicação HTTPS no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o app quando há um push para `main`. O endereço padrão deste repositório é `https://henrypaulino.github.io/drum-studio/`.

1. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como origem da publicação.
2. Em **Settings → Secrets and variables → Actions**, crie o secret `VITE_GOOGLE_CLIENT_ID` com o OAuth Client ID do Google. Sem ele, o site publica normalmente, mas o login e a sincronização pessoal ficam desativados.
3. Faça push para `main` ou execute **Actions → Deploy to GitHub Pages → Run workflow**. O primeiro deploy pode levar alguns minutos.
4. No projeto Google Cloud, adicione `https://henrypaulino.github.io` às origens JavaScript autorizadas do OAuth Client ID.

O Vite usa o caminho `/drum-studio/` somente no workflow do GitHub Pages; desenvolvimento local e outros builds continuam usando `/`.
