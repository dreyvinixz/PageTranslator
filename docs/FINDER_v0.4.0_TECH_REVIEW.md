# PageTranslator Finder v0.4.0 — Varredura automática + revisão técnica

Esta prévia implementa **scroll-to-scan**. Não executa OCR ou tradução, não baixa modelos e não envia imagens/trechos a serviços externos. A qualidade visual do Finder heurístico **não foi homologada** nos novos exemplos de quadrinhos ocidentais.

## Problema demonstrado

As capturas da v0.3.3 mostram caixas com excesso de área, regiões textuais parcialmente cortadas e uma caixa que engloba mais de um balão. Isso é falha de **separação semântica de instâncias**, não um parâmetro isolado de padding. Ajustar limiares e porcentagens para cada captura produziria overfitting à página de teste.

## Nova operação automática

- Clique no ícone PageTranslator: o Finder inicia e analisa **a página visível** sem novo clique no botão Finder. O painel mostra `Auto ao rolar: ligado`.
- Ao rolar (inclusive scroll em leitores aninhados) as caixas antigas são invalidadas imediatamente. Após ~1 segundo sem novos eventos, o Finder analisa a nova região.
- Um intervalo mínimo de 4 segundos **entre os inícios** das capturas reduz consumo de CPU e limita screenshots. Uma análise por vez; o último evento de scroll fica pendente até a análise anterior terminar.
- Redimensionar ou carregar uma imagem dinâmica também agenda nova análise; páginas em segundo plano não capturam. Não existe polling periódico: se a página ficar parada, não ocorre análise repetida.
- `Auto ao rolar: ligado/pausado` permite desligar/religar. `Selecionar imagem (manual)` pausa o automático para manter o enquadramento manual.
- O botão Finder força nova leitura sob os mesmos limites. Erro não provoca tentativas infinitas; o usuário pode solicitar nova leitura. O estado é local à aba/sessão.
- Imagens maiores continuam reduzidas para no máximo 850 px antes da análise local; não há Tesseract ou OCR.

## Pesquisa: implementações mais promissoras

| Referência | Técnica | Valor para PageTranslator | Limitações |
| --- | --- | --- | --- |
| https://github.com/dmMaze/comic-text-detector | DBNet + U-Net e detecção/segmentação de texto para quadrinhos | Blocos e máscaras de texto mais estáveis que caracteres escuros sobre fundo branco | Código GPL-3.0 e dependências pesadas; verificar licença antes de reutilizar |
| https://github.com/Ashu11-A/Manga-Segment | YOLO e U-Net com classes balão/legenda/texto/quadro | Detecção **do balão enquanto objeto** e não apenas da tinta | Dataset limitado, licença AGPL-3.0, não extrapolar métricas do README para a HQ de Batman |
| https://github.com/ragavsachdeva/magi | Visão profunda para painéis, textos e relações com personagens | Associação de falas com quadros e ordem de leitura | Pesos e dados declarados **somente para pesquisa acadêmica**; não incorporar à extensão distribuível sem permissão |
| https://huggingface.co/huyvux3005/manga109-segmentation-bubble | YOLO11n de segmentação de instâncias de balões | Máscara separada por balão, permitindo limitar o OCR à área correta | Treino em mangá, possível diferença de domínio em HQ ocidental |
| https://huggingface.co/mednasserallah/manga109-segmentation-bubble-onnx | Exportação ONNX de ~11,8 MB do modelo anterior | Candidato para inferência **local** no Chrome/Edge via ONNX Runtime Web | Nenhum modelo foi incorporado/rodado ainda. A licença dos dados de treino merece auditoria |
| https://github.com/igun997/manga-translator | Combina heurísticas e segmentação ONNX | Referência prática para híbrido geometria + máscara de balão | Não aceitar claims de desempenho como comprovação em nossas HQs |

### Cuidados jurídicos e técnicos

A etiqueta Apache-2.0 atribuída aos pesos da segmentação não substitui os termos dos dados de treino. O conjunto Manga109 restringe as imagens a uso acadêmico e proíbe redistribuição; Manga109-s tem termos diferentes, incluindo condições específicas para resultados comerciais. Fontes: https://manga109.github.io/manga109-project-website/en/ e NOTICE do exportador ONNX https://huggingface.co/mednasserallah/manga109-segmentation-bubble-onnx/blob/main/NOTICE. Pesos não devem ser incorporados à release sem essa análise.

## Arquitetura recomendada (etapa seguinte, ainda não implementada)

1. **Source / viewport:** mapear elementos `img/canvas` em coordenadas reais. Cache por URL de imagem, quadro e versão do conteúdo. Scroll deve apenas atualizar coordenadas quando a imagem não mudou.
2. **Balloon instance segmentation:** detectar instâncias (`id`, `bbox`, `mask`, `score`, `class`) usando modelo treinado para balões, legendas e caixas narrativas. Não unir duas instâncias apenas porque seus fundos se conectam.
3. **Text detection:** detectar linhas, palavras e seus polígonos com detector de texto especializado. Tratar estilo/colorização de maneira independente do fundo branco.
4. **Associação:** atribuir cada grupo de texto a **uma única instância de balão** pela interseção entre máscara e polígonos. Se há duas candidatas possíveis, texto fora da máscara, ou múltiplas falas potencialmente misturadas, marcar `REVIEW_REQUIRED` e **não traduzir automaticamente**.
5. **OCR por região aprovada:** recortar apenas os pixels da máscara/interior do balão em resolução adequada. Tradutor recebe somente a frase reconhecida, não uma página inteira com textos vizinhos.
6. **Overlay:** caixa de tradução alinhada à região aprovada; no futuro renderização pela máscara/forma, mantendo acesso ao texto original.

Contrato sugerido:

```ts
type Region = {
  id: string; kind: "speech" | "thought" | "caption" | "unknown";
  bbox: { x: number; y: number; width: number; height: number };
  mask?: Uint8Array; confidence: number;
  textGroupIds: string[];
  status: "DETECTED" | "REVIEW_REQUIRED" | "READY_FOR_OCR";
};
```

**Controle de qualidade prioritário:** evitar falas misturadas e textos faltantes, mais importante que reproduzir a borda oval perfeitamente. E não tratar scores heurísticos como probabilidades calibradas.

## Próximos experimentos: curtos, sem benchmark excessivo

Antes de substituir o Finder, rodar **prova de viabilidade pontual** com poucas capturas autorizadas: balões conectados, balões escuros, caption boxes e a HQ ocidental apresentada. O objetivo não é publicar um percentual de acurácia a partir de três imagens; é verificar se o modelo separa **instâncias** que a heurística mistura, medir latência aproximada e custo de memória no navegador. Se falhar, experimentar outro detector especializado em vez de ajustar limiares indefinidamente.

## Teste v0.4.0 no Chrome e Edge

1. Desative a v0.3.3 e carregue a pasta do ZIP contendo `manifest.json` em `chrome://extensions` ou `edge://extensions`, com Modo do desenvolvedor ativo.
2. Abra a HQ, recarregue e clique **uma vez** no ícone: a leitura inicial deve iniciar automaticamente e aparecer `Auto ao rolar: ligado`.
3. Role várias páginas e observe as caixas antigas desaparecerem; as novas devem reaparecer após a rolagem parar, sem clicar em Finder.
4. Pare de rolar por 20 segundos: a extensão não deve fazer novas capturas se a página não mudar.
5. Pressione `Auto ao rolar: pausado`, role e confira que não há novas leituras; ligue novamente. A seleção manual deve ser utilizável sem sobrescrita.
6. Mude de aba e retorne: leituras em segundo plano ficam suspensas.
7. Erros devem ser mostrados, e não provocar loops de captura ou perder o painel.

**Escopo:** este PR **não promete precisão maior de balões**. Resolve apenas usabilidade e estabilidade da varredura enquanto preparamos a substituição fundamentada do detector.
