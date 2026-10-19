# PageTranslator Browser — Chrome/Edge v0.1.0 Preview

Extensão **Chromium Manifest V3** experimental, independente do APK Android. Reconhece inglês em uma área selecionada da página e mostra texto original/tradução em um painel flutuante.

## Instalar uma compilação do GitHub Actions

1. Abra **Actions → Browser Extension · Preview** no repositório.
2. Abra uma execução bem-sucedida e baixe o artifact **PageTranslator-browser-v0.1.0-preview**.
3. Extraia o artifact e depois **PageTranslator-browser-v0.1.0-preview.zip**. A pasta final deve conter **manifest.json**, **background.js** e **vendor/**.
4. No Chrome, abra **chrome://extensions**; no Edge, **edge://extensions**.
5. Ative **Modo do desenvolvedor** e escolha **Carregar sem compactação** (Load unpacked). Selecione a pasta extraída contendo o manifest.
6. Abra um leitor de HQ via HTTP(S), clique no ícone da extensão e arraste sobre um balão em inglês.

**Não tente instalar o ZIP diretamente como se fosse APK.** A publicação nas lojas Chrome Web Store / Edge Add-ons ainda não foi realizada.

## Uso

- O OCR começa depois que você **arrasta uma seleção**. Primeiro uso pode demorar mais: o modelo e o WebAssembly são inicializados.
- Um cartão sobre a página mostra o **texto original (EN)** sem substituir pixels do quadrinho.
- **Traduzir localmente:** usa a interface experimental **Translator API** quando o Chromium a disponibiliza. O navegador pode solicitar download de idioma. Se indisponível, a opção não funciona — isto não significa falha do OCR.
- **Traduzir online:** após um clique específico, envia **somente o texto reconhecido** a api.mymemory.translated.net para tradução EN→PT-BR. O serviço de terceiros tem limites e pode ficar indisponível.
- **Outro balão** repete o processo. **Copiar** copia original ou tradução exibida. **Esc** cancela a seleção. A rolagem/resize remove o cartão para evitar posições incorretas.

## Desenvolvimento

Requer Node.js 22 e npm (para empacotamento; não é necessário Node no navegador).

    cd browser-extension
    npm install
    npm run build
    npm run verify

Depois carregue **browser-extension/dist** com **Carregar sem compactação**. Não carregue o diretório fonte, pois os arquivos vendor são gerados pelo build.

### Arquitetura

- **content.js**: seleção, cartão e apresentação do texto. Não executa OCR no domínio visitado.
- **background.js**: captura pontual via tabs.captureVisibleTab, valida a guia ativa, cria documento offscreen e oferece tradução online sob consentimento.
- **offscreen.html/offscreen.js**: desenha apenas o recorte em canvas, executa Tesseract.js em worker da extensão e devolve texto OCR.
- **scripts/build.mjs**: copia dependências locais tesseract.js, tesseract.js-core e modelo eng.traineddata.gz para dist/vendor.
- **.github/workflows/browser-extension.yml**: empacota a extensão para Chrome/Edge em ZIP, sem assinatura de loja.

A política CSP não permite carregamento de scripts remotos. Usamos workerBlobURL:false para impedir geração de worker por blob e evitar CSP do site. Não há backend PageTranslator.

## Privacidade

- Sem cadastro, analytics, histórico de leitura ou armazenamento de screenshots.
- OCR local. Captura somente após seleção explícita, usando a **aba ativa**. Imagem mantida em memória durante o processamento.
- **Tradução online não é privada no mesmo sentido que a local**: o texto escolhido sai do computador para o fornecedor MyMemory por HTTPS. Use somente se concordar com os termos e políticas desse serviço; não selecione conteúdo sensível.
- Não usa permissão global de sites, não injeta persistentemente em sites, não contorna DRM nem captura outros aplicativos ou guias.
- As dependências OCR são baixadas durante o **build**, não durante a leitura.

## Limitações / critérios de homologação

- Escopo v0.1.0: **área visível da aba** e seleção de um balão por vez. Não há detecção semântica de balões, tradução automática contínua nem restauração do fundo sob o texto.
- Não funciona em páginas internas (chrome://, edge://), PDFs visualizados internamente nem interfaces protegidas que impedem injeção/captura.
- Fontes estilizadas, texto vertical, baixa resolução e idioma diferente de inglês podem reduzir precisão.
- Testar zoom 80/100/125%, HiDPI, rolagem, fullscreen, sites com CSP restritiva, resposta vazia, offline, timeout do fornecedor e disponibilidade local Translator.
- Certificar que apenas o texto foi transmitido após clicar em **Traduzir online** (DevTools → Network).
- Registrar tempo de OCR, consumo de memória e bugs antes de uma release pública.
- A versão foi implementada e possui **validação estática de build**, não é uma homologação em Chrome/Edge real. Esse passo requer testes interativos.

## Próximas versões propostas

1. Segmentação de múltiplos balões, tradução de todos os balões visíveis e re-renderização discreta sobre as falas.
2. Modo aprendizado com EN/PT e glossário escolhidos pelo usuário.
3. Reconhecimento incremental ao rolar, cache em memória por imagem e melhorias de latência/posicionamento.
4. Automatização de testes end-to-end e publicação em lojas (política de privacidade e identidade visual).
