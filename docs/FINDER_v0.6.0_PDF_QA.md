# PageTranslator Finder v0.6.0 — Máscaras, OCR PT/EN e relatório PDF (prévia)

> **Experimental, não homologado.** O PDF Batman: O Cavaleiro #1 (2022) foi fornecido pelo próprio usuário exclusivamente para avaliação local. Nenhuma página, painel, screenshot, texto OCR integral ou imagem do PDF é adicionada ao repositório ou ao ZIP da extensão.

## Mudanças

- Mantidos clique inicial, auto-scroll debounce de ~1 s e limite de 4 s entre capturas. Nenhum OCR é lançado repetidamente pelo scroll.
- `finder-instances.js`: derivação de máscaras RLE independentes por candidato de fala. Quando duas unidades de fala ocupam uma área clara conectada, pixels claros são particionados por proximidade aos seus centros de tinta (`inkRect`) e pixels de outros núcleos são excluídos. O resultado gera um `instance-N`, `bbox`, `maskPolygon` e `maskPixelCount` para cada candidato. **Não é segmentação neural nem confirmação de balão; máscaras são hipóteses geométricas.**
- `finder-content.js`: exibe contornos de máscara (com inspecção e seleção manual), e associa formas e textos no **mesmo sistema de coordenadas**.
- `finder-offscreen.js`: reconhecimento sob demanda de somente o recorte escolhido, usando Tesseract.js + modelos PT e EN incluídos no ZIP. Operação local com tempo limite de resposta e memória de sessão, sem serviço OCR remoto. Máscaras limitam os pixels fornecidos ao OCR; recortes arriscados precisam de correção manual.
- `finder-language.js`: detecção de idioma pelo LanguageDetector nativo quando disponível, fallback lexical conservador e opção manual. Seleção origem Auto/PT/EN e destino PT/EN/ES/FR. A seleção de destino **não garante disponibilidade**: Chrome/Edge podem não oferecer o modelo/pacote de idiomas local.
- Botão **Localizar textos por OCR**: realiza uma leitura local sob demanda da área visível, identifica linhas fora das regiões claras (importante no PDF), agrupa de forma conservadora e exibe regiões textuais independentes sem alegar que sejam balões. Pausa auto-scroll durante o OCR e não envia recortes a terceiros.\n- Botão **Traduzir localmente** verifica a API disponível em tempo de execução. Não há tradução remota automática nem transmissão para MyMemory.

## Avaliação inicial do PDF — realizada localmente

- Arquivo: 32 páginas, cada página contém imagem rasterizada e nenhum texto nativo extraível.
- Processamento geométrico: todas as 32 páginas (cores/luminosidade → regiões claras candidatas).
- OCR Tesseract PT+EN: amostra de 9 páginas: **5, 8, 9, 15, 16, 20, 21, 30 e 31**.
- **880 palavras OCR** passaram o filtro mínimo de confiança; **266** tinham centro dentro de uma região clara candidata. Proporção observada **266/880 = 30,2%**.

| Página | Palavras OCR acima do limite | Dentro de candidata clara | Suporte |
| --- | ---: | ---: | ---: |
| 5 | 87 | 34 | 39,1% |
| 8 | 99 | 28 | 28,3% |
| 9 | 139 | 27 | 19,4% |
| 15 | 124 | 50 | 40,3% |
| 16 | 124 | 41 | 33,1% |
| 20 | 19 | 1 | 5,3% |
| 21 | 78 | 8 | 10,3% |
| 30 | 141 | 55 | 39,0% |
| 31 | 69 | 22 | 31,9% |

### Interpretação: o que foi e o que não foi medido

- São **palavras de OCR**, não número de balões. Incluem títulos, placas, quadros, texto estilizado ou falsos positivos do OCR.
- O suporte geométrico depende de um detector Python com limiares de regiões claras, **não é um teste end-to-end da extensão v0.6**. A proporção de 30,2% não deve ser apresentada como a *accuracy*, *precision* ou *recall* do Finder.
- O teste demonstra que ancorar OCR apenas nas áreas claras detectadas é insuficiente na HQ fornecida. Particularmente, páginas 9 e 21 contêm muitas palavras que essa detecção não cobre.
- A v0.6 passou testes sintéticos de partição de áreas conectadas, mas **não há anotações humanas de referência (máscaras/polígonos + associação texto→balão)** suficientes para medir uma melhora de precisão no PDF. Um detector neural de instâncias continua sendo etapa de pesquisa e validação.

## Como reproduzir em ambiente local (PDF não incluído)

Requisitos: Python 3, `pymupdf`, `numpy`, `opencv-python-headless`, `pytesseract`, executável `tesseract` e idiomas `por` e `eng` instalados.

```bash
python -m pip install pymupdf numpy opencv-python-headless pytesseract
python tools/qa_pdf.py "/caminho/arquivo.pdf" --out "./qa-output"
```

O script percorre todas as páginas, executa OCR somente nas 9 amostras informadas (alteráveis com `--ocr-pages`) e produz `qa-pdf.json` apenas com métricas e coordenadas agregadas; **não publica imagens nem transcrições**.

## QA pendente no navegador

1. Desativar extensão anterior; instalar ZIP v0.6.0 em Chrome/Edge. Abrir a página de referência e verificar mesmo comportamento do scroll.
2. Confirmar que balões próximos recebem máscaras distintas. Se a máscara cortar palavras, refinar manualmente e anotar caso para os testes.
3. Clicar **Localizar textos por OCR** para encontrar textos não detectados pelo Finder geométrico; conferir que linhas de balões vizinhos não se misturam. Depois clicar **Ler texto (OCR local)** em balão português e inglês: validar resultado real sem misturar balões.
4. Conferir detecção PT/EN e escolha de tradução. Testar indisponibilidade da API, idioma desconhecido, mesmo idioma e primeiro download do modelo sob comando explícito.
5. Testar consumo de memória, reconexão offscreen, zoom, HiDPI e CSP.
6. Criar anotação ground-truth para páginas 5, 8, 9, 15, 16, 20, 21, 30 e 31 e medir `instance IoU`, `precision/recall`, atribuição de texto, OCR `CER/WER` e latência.
7. **Bloqueio de modelo neural:** antes de distribuir pesos ONNX revisar origem, licença do modelo e restrições de treino; o PR #19 não inclui o modelo Manga109.

### Privacidade, confiabilidade e releases

Somente `activeTab`, `scripting`, `storage` e `offscreen`. O OCR usa um documento offscreen da própria extensão e os modelos são empacotados pelo GitHub Actions. Não há screenshot compartilhado com terceiros. O navegador pode baixar pacotes de tradução nativos somente se o usuário acionar tradução. O projeto mantém log verboso e ZIP preview; **não declarar estável enquanto QA de navegador e masks anotadas estiver pendente**.
