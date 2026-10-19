# PageTranslator Browser Finder v0.3.1 — Diagnostic Preview

Esta versão foi criada para **testar a localização de imagens e possíveis balões**, antes de executar OCR ou tradução. Não altera a versão Android.

## O que a extensão faz

Ao clicar no ícone, abre um painel com dois controles independentes:

- **Selecionar imagem (manual):** arraste o cursor sobre qualquer imagem, quadro ou balão. Uma caixa azul marca a região e mostra X/Y/largura/altura. Nenhum OCR é disparado.
- **Identificar imagens (Finder):** procura elementos HTML de imagem, canvas, vídeo, SVG e imagens CSS visíveis na página. O resultado é apresentado como caixas azuis com numeração e detalhes.

Escolha o modo antes do Finder:

- **Genérico:** detecta elementos visuais HTML. Sem screenshot, sem varredura de pixels, instantâneo na maioria das páginas. Os elementos podem ser fotos, imagens de produto, figuras, quadrinhos, etc.
- **Quadrinhos (Especialista):** detecta imagens/páginas e faz **uma captura local por clique**, reduzida a no máximo 850 px por dimensão. A análise identifica pequenos componentes escuros parecidos com **traços de letras** sobre fundos claros, agrupa componentes em linhas e linhas em regiões. Contornos claros são usados apenas como evidência adicional de forma. As caixas amarelas tracejadas são hipóteses de regiões com fala; balões escuros, letras muito grandes ou estilizadas ainda podem ser perdidos.

Nenhum modo nesta versão usa Tesseract, OCR, IA remota, tradução ou chamadas a serviços de terceiros. Também não executa captura continuamente nem envia dados para a rede.

## Instalar no Chrome ou Edge

1. Baixe o arquivo `PageTranslator-Finder-v0.3.1-preview.zip` do artifact **Browser Finder · Diagnostic Preview** no GitHub Actions.
2. Extraia o ZIP até encontrar `manifest.json`, `background.js`, `finder-core.js` e `finder-content.js`. O pacote deve ser **muito menor** que as versões com modelos de OCR.
3. Em `chrome://extensions` ou `edge://extensions`, ligue **Modo do desenvolvedor**, desative/remova as versões anteriores, e clique **Carregar sem compactação**.
4. Selecione a pasta extraída, recarregue a aba do leitor e clique no ícone PageTranslator Finder.

## Plano de testes no leitor real

URL de referência: https://batcave.biz/reader/683/3907#page-3

1. Abrir a extensão e escolher **Genérico** → **Finder**. Verificar se as imagens/quadros grandes foram marcados em azul.
2. Clicar numa caixa e observar X/Y/largura/altura; fazer screenshot dos resultados.
3. Trocar para **Quadrinhos** → **Finder**. Verificar se aparecem caixas amarelas em torno das áreas com letras nos balões, como "IT'S INESCAPABLE, ISN'T IT?" e outros balões na página.
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

## Diagnóstico de melhoria v0.3.1

Os prints fornecidos pelo usuário mostraram **2 imagens azuis, 3 regiões amarelas, sendo 2 falsos positivos sobre a janela** e falhas em localizar balões ovais. A causa era o uso de componentes brancos grandes: a janela clara formava áreas conectadas, mas as letras no balão quebravam ou alongavam os componentes claros.

A nova versão é **ancorada em traços semelhantes a caracteres**, não simplesmente em brancura. Ao usar os pixels do segundo print como referência local de teste, o detector encontrou **quatro grupos correspondentes às áreas com falas visíveis**, incluindo o quadro retangular superior direito e três regiões de balões arredondados, sem repetir os dois falsos positivos da janela. Isso é uma avaliação de **um único print**, não uma taxa de acurácia generalizável; o teste em Chrome/Edge segue pendente.

**Não há reconhecimento de palavras (OCR)** nesta versão. O detector apenas estima regiões que parecem conter texto, com score heurístico não calibrado. A borda amarela pode não corresponder ao contorno exato do balão. Textos claros sobre fundo escuro, letras muito grandes e HQs com alto contraste irregular são limitações conhecidas.
