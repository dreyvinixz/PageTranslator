# PageTranslator Browser Finder v0.3.0 — Diagnostic Preview

Esta versão foi criada para **testar a localização de imagens e possíveis balões**, antes de executar OCR ou tradução. Não altera a versão Android.

## O que a extensão faz

Ao clicar no ícone, abre um painel com dois controles independentes:

- **Selecionar imagem (manual):** arraste o cursor sobre qualquer imagem, quadro ou balão. Uma caixa azul marca a região e mostra X/Y/largura/altura. Nenhum OCR é disparado.
- **Identificar imagens (Finder):** procura elementos HTML de imagem, canvas, vídeo, SVG e imagens CSS visíveis na página. O resultado é apresentado como caixas azuis com numeração e detalhes.

Escolha o modo antes do Finder:

- **Genérico:** detecta elementos visuais HTML. Sem screenshot, sem varredura de pixels, instantâneo na maioria das páginas. Os elementos podem ser fotos, imagens de produto, figuras, quadrinhos, etc.
- **Quadrinhos (Especialista):** detecta imagens/páginas e faz **uma captura local por clique**, com redução para máximo 850 px de largura/altura, para procurar regiões claras conectadas com detalhes escuros (heurística de possíveis balões). Mostra contornos tracejados amarelos. Um quadro branco com texto pode aparecer como falso positivo, e balões escuros/coloridos podem passar despercebidos.

Nenhum modo nesta versão usa Tesseract, OCR, IA remota, tradução ou chamadas a serviços de terceiros. Também não executa captura continuamente nem envia dados para a rede.

## Instalar no Chrome ou Edge

1. Baixe o arquivo `PageTranslator-Finder-v0.3.0-preview.zip` do artifact **Browser Finder · Diagnostic Preview** no GitHub Actions.
2. Extraia o ZIP até encontrar `manifest.json`, `background.js`, `finder-core.js` e `finder-content.js`. O pacote deve ser **muito menor** que as versões com modelos de OCR.
3. Em `chrome://extensions` ou `edge://extensions`, ligue **Modo do desenvolvedor**, desative/remova as versões anteriores, e clique **Carregar sem compactação**.
4. Selecione a pasta extraída, recarregue a aba do leitor e clique no ícone PageTranslator Finder.

## Plano de testes no leitor real

URL de referência: https://batcave.biz/reader/683/3907#page-3

1. Abrir a extensão e escolher **Genérico** → **Finder**. Verificar se as imagens/quadros grandes foram marcados em azul.
2. Clicar numa caixa e observar X/Y/largura/altura; fazer screenshot dos resultados.
3. Trocar para **Quadrinhos** → **Finder**. Verificar se aparecem caixas amarelas em torno de candidatos a balões claros, como "IT'S INESCAPABLE, ISN'T IT?" e outros balões na página.
4. Voltar a **Selecionar imagem (manual)**, arrastar sobre um balão. Conferir que a região fica marcada sem travar.
5. Rolar a página: todas as caixas antigas devem desaparecer. Pressionar Finder para atualizar na nova posição.
6. Repetir os testes em Edge; caso falhe captura, verificar o erro no painel e o console em Extensões → Inspecionar service worker.
7. Informar **quantas caixas azuis e amarelas foram encontradas**, quais são falsas detecções, e enviar screenshot. Sem isso não podemos afirmar que existe detecção automática real de balões.

## Arquitetura de próxima etapa

1. Localizar imagens na página (DOM e canvas).
2. Localizar candidatos a balão usando análise visual e, futuramente, um detector especializado treinado com bounding boxes/polígonos.
3. Recortar **somente as regiões confirmadas**, executar OCR uma vez por região e retornar texto + posição.
4. Traduzir **somente texto** (local quando disponível, remoto com consentimento).
5. Sobrepor nova caixa preservando localização, largura, alinhamento e, com detecção refinada, o formato do balão.

**Limitações:** heurística não reconhece texto e não detecta semanticamente balões; não identifica imagens dentro de frames de outros domínios que a extensão não consiga inspecionar; pode confundir fundos claros com balões. Página protegida do navegador pode impedir captura.
