# PageTranslator Finder v0.5.0 — Associar balões e grupos de texto (prévia)

Esta revisão se baseia na branch de auto-scroll v0.4.0 e **não altera** o ritmo de captura: ~1 s de debounce por rolagem, no mínimo 4 s entre inícios de leitura e nenhuma captura periódica com a página parada. O pipeline ainda **não executa OCR, identificação linguística nem tradução**.

## Interface e controles

- Identidade visual PageTranslator: ícone reduzido derivado da imagem oficial fornecida, cores azul-marinho/ciano e painel mais organizado.
- Atalho padrão **F9**. No painel, clique **Personalizar** e pressione uma tecla de função F2–F12 ou uma combinação com Ctrl/Alt/Shift/Meta. Preferência gravada em `chrome.storage.local`, não no website.
- O atalho liga/desliga o Finder **naquela aba após o usuário clicar no ícone da extensão pelo menos uma vez**. Não registra atalho global do navegador nem intercepta digitação em campos de texto. Se o navegador/site já usar determinada combinação, escolha outra.
- Seleção manual continua disponível. ESC cancela e restaura as caixas anteriores; o novo botão **Refinar enquadramento manualmente** abre o seletor a partir da região inspecionada.
- O painel de inspeção diferencia hipóteses, riscos e dados ainda não observados, sem usar porcentagens heurísticas como confiança calibrada.

## As seis perguntas

| Pergunta | Fonte de evidência v0.5 | Resposta/limitação |
|---|---|---|
| 1. Isto é um balão? | Forma clara próxima a agrupamentos de tinta | **Possível** balão arredondado/caixa narrativa, nunca confirmação sem segmentação de instâncias |
| 2. Possui texto? | Agrupamento de traços com aparência de caracteres | **Indício de texto**; ainda não OCR |
| 3. O texto pertence ao balão? | Cobertura da `inkRect` por forma candidata, associação exclusiva | `shape-N` provisório; se duas formas competem ou uma forma engloba duas falas, `REVIEW_REQUIRED` |
| 4. Quantos vizinhos e a quem pertence cada grupo? | Proximidade entre regiões `inkRect` e associações individuais | IDs dos grupos próximos e seus balões hipotéticos; não é uma contagem semântica precisa de balões |
| 5. Qual é o idioma? | Exigirá OCR em região isolada e identificador de idioma | `detectedLanguage = null` até essa etapa |
| 6. Tradução suportada e para qual idioma? | Exigirá catálogo de pares suportados, escolha de destino e consentimento quando remoto | `translationSupported = null` até essa etapa |

## Política conservadora de associação

`finder-association.js` recebe dois conjuntos **independentes**: `findLightRegions` (formas) e `findTextCandidates` (tinta de texto). Aplica a geometria de `refineSpeechRegions` e `markMixedInkRegions` para proteger falas vizinhas. Mantém um grupo textual por região e atribui no máximo **um** `balloonId`.

- Forma com cobertura >=78% de um grupo e nenhum outro candidato que cubra >=60%: vínculo provisório.
- Uma forma potencialmente compartilhada por duas falas: ambas `REVIEW_REQUIRED`.
- Duas formas disputam o mesmo texto: `REVIEW_REQUIRED`; não se escolhe arbitrariamente pela primeira.
- Interseção das áreas de tinta ou recorte contaminado: `REVIEW_REQUIRED`.
- Grupo sem forma suficientemente confiável: `TEXT_ONLY` (não é automaticamente rotulado como balão).
- Mesmo `CANDIDATE` **não é** autorização para tradução automática: exige validação de instância, OCR e idioma.

IDs `shape-N` / `text-N` são **locais a cada captura**. As regiões podem desaparecer e voltar com nova numeração ao rolar; persistência de IDs precisa de tracking por imagem/página.

## Desafio técnico ainda não resolvido

Balões conectados visualmente podem gerar **uma única região clara** embora contenham duas falas. O associador os marca como ambíguos, mas não segmenta os contornos reais. Também há risco de falsos positivos em janelas, texturas e placas, balões escuros e texto desenhado. Ajustar padding não substitui um detector/segmentador de instâncias.

**Próxima prova de viabilidade:** avaliar detectores locais de balões e textos em um conjunto anotado de imagens autorizadas (balões conectados, legendas, escuros, redondos, sobreposição). Métricas separadas: *precision/recall* de instâncias, acerto da atribuição texto→balão, porcentagem `REVIEW_REQUIRED`, contaminação de fala e latência/CPU. Antes de distribuir pesos, revisar licenças do modelo e dos dados de treino, conforme `docs/FINDER_v0.4.0_TECH_REVIEW.md`.

## QA rápido

1. Instale o ZIP `PageTranslator-Finder-v0.5.0-preview` do workflow da branch; desative outras versões da extensão.
2. Entre em uma HQ, clique no ícone e confirme que começa a detectar sem cliques adicionais. Role vários quadros e confirme o comportamento v0.4.
3. Confira a nova logo no cabeçalho, escolha `Personalizar`, pressione F10 e verifique que F10 fecha/reabre o painel. Recarregue a página, clique no ícone e veja o atalho persistido.
4. No modo Quadrinhos, clique nas regiões detectadas e confira status, balão candidato, grupos vizinhos e campos de idioma/tradução explicitamente não avaliados.
5. Identifique caso em que **duas falas compartilham uma região branca**: ambas devem ser sinalizadas para revisão, jamais apresentadas como única fala já traduzida.
6. Entre em seleção manual, pressione ESC e verifique que as regiões anteriores retornam.
7. Execute `npm test && npm run build && npm run verify`. GitHub Actions preserva logs, verificação de scripts JS e ZIP de preview; nada é publicado como release estável.

**Privacidade:** somente permissão de aba ativa, injeção sob clique e `storage` para a tecla escolhida. A logo é um recurso local da extensão. Nenhuma chamada a OCR, rede ou serviço de tradução nesta versão.
