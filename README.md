# PageTranslator

Aplicativo Android experimental para traduzir texto visível em HQs e imagens na tela, preservando a leitura original em inglês.

## v1.0.0 — Preview (Android 8+)
- Captura consentida via **MediaProjection**, com serviço de primeiro plano e notificação para encerrar a captura.
- OCR local com Google ML Kit Text Recognition.
- Tradução **inglês → português** no dispositivo usando Google ML Kit Translation (requer baixar modelo na primeira execução).
- Exibição flutuante sobre o navegador e botão **EN → PT ON/OFF**.
- Sem conta, sem backend, sem salvar screenshots e sem permissão de Acessibilidade.

**Estado:** pré-lançamento experimental; compilação automatizada no GitHub Actions. A detecção usa blocos retangulares de OCR, não segmentação exata de balões. Dispositivos com `FLAG_SECURE` podem impedir captura; o app não tenta contornar essa proteção.

## APK

Abra [Releases](https://github.com/dreyvinixz/PageTranslator/releases). A versão `v1.0.0` somente será publicada automaticamente se a compilação do APK passar. O APK é assinado com a chave *debug* gerada pelo ambiente de CI: é **apenas para testes**, não adequado como distribuição assinada de produção. Se instalar uma atualização de outro build, poderá ser necessário desinstalar a versão anterior.

## Como usar

1. Instale o APK em seu próprio dispositivo Android 8+.
2. Abra o PageTranslator e permita **exibir sobre outros apps**.
3. Toque **Iniciar tradução** e autorize a captura solicitada pelo Android.
4. Volte ao leitor de HQ no navegador; após o download inicial do modelo, aguarde alguns segundos pelo OCR.
5. Use o botão flutuante **EN → PT** para ativar/desativar a tradução.
6. Pare pelo botão do aplicativo ou pela notificação. Não capture apps com dados privados.

## Desenvolvimento

- Kotlin 2.0.21 / Android Gradle Plugin 8.7.3 / Gradle 8.9 / JDK 17
- compileSdk 35, targetSdk 35, minSdk 26
- `gradle assembleDebug` para build local, ou a GitHub Action `Android APK · Preview v1`.

## Arquitetura

`MainActivity` → solicita permissões → `ScreenTranslateService` captura `ImageReader` → ML Kit OCR → ML Kit Translation → `TranslationOverlay` exibe as traduções. Um cache pequeno em memória evita retraduzir frases durante a sessão. A detecção/retradução é limitada a uma execução por ~2 segundos, não a cada frame.

## Limites e próximos passos

- **v1.1:** tradução sob demanda ao tocar em um bloco; modo aprendizado bilíngue.
- **v1.2:** agrupar falas e melhorar posicionamento ao rolar e girar o aparelho.
- **v1.3:** detectar balões de HQ, revisar legibilidade e sobreposição.
- **v2.0:** testes de usabilidade, privacidade e publicação assinada com uma chave estável.

Veja [docs/QA.md](docs/QA.md) para testes manuais e restrições. O app não baixa nem redistribui quadrinhos; respeite os direitos de seus autores.

## Referências oficiais
- [MediaProjection](https://developer.android.com/media/grow/media-projection)
- [ML Kit Text Recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [ML Kit Translation](https://developers.google.com/ml-kit/language/translation/android)
- [Termos de atribuição ML Kit](https://developers.google.com/ml-kit/language/translation/translation-terms)

## v0.2.0 — Detecção automática de regiões de HQ no Chrome/Edge (Preview)

A extensão Chromium (Manifest V3) agora tem um modo automático: **um clique no ícone** procura regiões de fala em imagens/canvases visíveis, agrupa linhas do OCR local e apresenta sobreposições que se atualizam quando a leitura rola. **Não identifica perfeitamente o contorno dos balões**; trata-se de agrupamento geométrico de linhas, com seleção manual preservada.

A tradução local é tentada quando suportada pelo navegador. A tradução online de vários balões só começa **depois de ativar explicitamente "Online: ativar"**, pois transmite o texto reconhecido à MyMemory (limite de 30 pedidos por sessão). Sem consentimento, o OCR funciona localmente sem enviar a HQ.

Para instalar, baixe o artifact **PageTranslator-browser-v0.2.0-preview** da [GitHub Action](https://github.com/dreyvinixz/PageTranslator/actions/workflows/browser-extension.yml), extraia até obter **manifest.json** e carregue a pasta em chrome://extensions ou edge://extensions com Modo do desenvolvedor. Consulte [docs/WEB_EXTENSION.md](docs/WEB_EXTENSION.md) para QA, privacidade e limitações.


## v0.1.0 — Preview (Chrome e Edge)

Além do aplicativo Android, o PageTranslator possui agora uma **extensão de navegador Chromium (Manifest V3)** para traduzir regiões selecionadas de HQs em páginas web.

- Selecione um balão com o mouse, sem capturar a tela inteira continuamente.
- OCR local com Tesseract.js (modelo inglês empacotado na extensão).
- Veja o inglês original e tente tradução local com Translator API quando disponível.
- Opcionalmente, clique em **Traduzir online** para enviar apenas o texto reconhecido ao serviço MyMemory; screenshots nunca são enviados.
- Um painel flutuante exibe a tradução sobre a página; não modifica os pixels do quadrinho.

**Instalação:** baixe o artifact da execução **Browser Extension · Preview** em [Actions](https://github.com/dreyvinixz/PageTranslator/actions/workflows/browser-extension.yml), extraia o ZIP, ative o Modo do desenvolvedor em chrome://extensions (ou edge://extensions) e use **Carregar sem compactação** na pasta com o manifest.json.

A versão web é experimental e depende de testes interativos em Chrome e Edge; o build automatizado não equivale à homologação. Veja [docs/WEB_EXTENSION.md](docs/WEB_EXTENSION.md) para instruções, limitações e QA.
