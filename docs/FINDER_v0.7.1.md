# PageTranslator Finder v0.7.1 — OCR Reliability + panel-aware Vision Engine

> Prévia experimental. Base: `feat/browser-v0.6-instance-ocr-language`, não a `main`.
> O usuário relatou caixas cruzando balões e divisórias de painéis e
> `OCR indisponível: A captura demorou além do limite`.
> Esta entrega corrige problemas conhecidos de arquitetura, **não comprova ainda
> precisão de detecção de instâncias nem compatibilidade visual em todos os sites**.

## P0: OCR Reliability

- `background.js`: distinção real de três limites: **captura JPEG 10 s**
  (`CAPTURE_TIMEOUT`), **inicialização do worker PT/EN 50 s**
  (`OCR_INIT_TIMEOUT`), **reconhecimento do recorte 35 s**
  (`OCR_RECOGNITION_TIMEOUT`), além de abertura do documento em 12 s.
- `chrome.runtime.getContexts` para verificar documento offscreen,
  compatível com a versão mínima definida (Chrome 116+); caminho opcional
  `chrome.offscreen.hasDocument` apenas quando a API existe.
- `finder-ocr-runtime.js`: trabalho OCR exclusivo, rejeição `OCR_BUSY`
  e erros tipados. Erro de execução não deixa a fila permanentemente ocupada.
- `finder-offscreen.js`: mensagens `PT_OCR_PREPARE` e `PT_OCR_CROP`
  independentes; modelo mantido em cache de memória, sem disparo paralelo do worker.
- Timeout do OCR provoca fechamento do documento offscreen para destruir
  worker preso. Próxima tentativa recria documento e modelo. Uma tentativa
  é explícita, não há retries infinitos.
- Tempos `initMs`, `ocrMs`, `totalMs` e id do job retornam ao Finder
  e podem ser conferidos no inspetor. Não enviar screenshots a terceiros.

**Limitação do timeout:** o navegador não oferece cancelamento da captura
`chrome.tabs.captureVisibleTab` em progresso. O prazo rejeita o resultado;
o serviço não controla o cancelamento subjacente dessa chamada.

## P0: Vision Engine (geometria, ainda não detector neural)

- `finder-panels.js`: encontra divisórias verticais e horizontais com
  longas faixas de pixels quase uniformemente claras ou escuras. Só
  aceita divisão se ambas as regiões tiverem conteúdo visual.
- Texto é agrupado separadamente **dentro de cada quadro**, com IDs
  `panel-N`; máscara de instância fica limitada ao mesmo retângulo.
- Grupo com tinta que atravessa divisor é `REVIEW_REQUIRED`,
  nunca considerado seguro para tradução automática.
- Painel em modo Quadrinhos **não desenha mais caixas azuis gigantes**
  representando os elementos `img`/canvas. Desenha somente regiões de
  fala candidatas e máscaras onde disponíveis.
- Varredura OCR da página visível separa as linhas por painel detectado
  antes de formar grupos. Se os divisores falharem, ainda pode unir frases:
  é fallback heurístico, não garantia semântica.
- Preservados os intervalos do auto-scroll: debounce ~1 s e 4 s mínimos
  entre inícios de captura. OCR permanece sob comando explícito.

## Testes, evidências e bloqueadores

`npm test && npm run build && npm run verify` cobre regressões de
particionamento em painel triplo sintético, texto cruzando divisórias,
regiões conectadas, timeouts por etapa e concorrência de jobs.
GitHub Actions verifica empacotamento local do Tesseract `por`/`eng`.

O PDF Batman — O Cavaleiro (32 páginas, fornecido no chat) foi usado
anteriormente para OCR amostral e geometria Python; **esses números não
validam esta versão JavaScript.** O PDF e o screenshot de falha não são
redistribuídos no repositório. Arquivos visuais precisam ser avaliados em
ambiente autorizado com ground truth anotado.

**Ainda necessário antes de release estável**:
1. Chrome e Edge reais: primeiro OCR PT/EN, repetição, timeout de rede
   local/worker, recuperação após falha, captura em aba ativa e inativa.
2. Teste *end-to-end* de `finder-panels.js` e `finder-instances.js`
   sobre pixels do PDF e da captura de regressão.
3. Anotar balões reais e calcular IoU de máscara, precisão/recall de
   instâncias, mistura entre falas, CER/WER do OCR e latência P50/P95.
4. Um modelo de segmentação de instâncias (ONNX/WebGPU/WASM), caso a
   heurística de gutters falhe em painéis irregulares. Auditar licenças
   antes de distribuir pesos. Evitar confundir testes sintéticos com
   validação semântica.

## Instalação

Workflow `Browser Finder · Diagnostic Preview` publica o artifact
`PageTranslator-Finder-v0.7.1-preview` em ZIP. Instale como extensão
descompactada em Chrome/Edge. Desative a v0.6 antes de testar. Sem merge
automático e sem release stable antes do QA real.


## Reproduzir avaliação usando o algoritmo JavaScript real

A v0.7.1 inclui `tools/qa_finder_v071.py` que renderiza o PDF em memória
e passa os pixels RGBA ao processo Node `browser-extension/scripts/vision-evaluate.mjs`.
Esse processo carrega os **mesmos módulos** `finder-core.js`,
`finder-panels.js`, `finder-text.js`, `finder-fit.js` e
`finder-instances.js` da extensão. Cada página retorna somente
metadados (quantos painéis/candidatos, máscaras para revisão e tempo).
**Não substitui anotações de referência nem executa o OCR por Tesseract.**

```bash
python -m pip install pymupdf numpy
python tools/qa_finder_v071.py "/caminho/Batman-O-Cavaleiro.pdf" \
  --pages 5,8,9,15,16,20,21,30,31 \
  --output "./qa-output/v071.json"
```

Para comparação de versões, rode o mesmo comando e PDF nas branches
anteriores e na v0.7.1, com conjuntos anotados. A checagem do código
Node/Python é automatizada no CI; **o PDF real não integra o CI** devido
aos direitos autorais e à ausência do arquivo nos runners.
