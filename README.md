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
