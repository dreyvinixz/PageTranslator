# Finder v0.3.2 — Isolamento das falas (prévia de diagnóstico)

Objetivo: distinguir **uma fala por caixa**. A borda do balão pode ser oval, retangular, composta ou visualmente conectada a outro balão. O OCR futuro não pode receber um recorte que inclua palavras de outra fala.

## Alterações

- O detector junta caracteres em linhas e forma uma unidade de fala comparando linhas **consecutivas**, e não a união geométrica acumulada de todas as linhas do grupo (que podia atravessar balões próximos).
- Reduz a tolerância de distância entre linhas e exige alinhamento horizontal real; em casos incertos é melhor separar em duas regiões a misturar textos.
- Ajusta o padding ao redor das letras, de forma mais justa. Essas caixas são candidatas para o OCR futuro, **não substitutos do contorno original**.
- Registra `inkRect` (letras estimadas) separadamente do `rect` (retângulo sugerido para leitura). Borda externa de duas caixas pode se sobrepor sem problema. Se o retângulo de uma caixa alcançar a tinta estimada de outra fala, a interface mostra a borda **vermelha** e alerta de possível mistura.
- Corrige o contador da interface: `text-region-candidate` agora conta como **região candidata de fala**, não como imagem. Uma HQ contendo 2 elementos de imagem e 4 textos deve exibir `2 imagem(ns) / 4 região(ões) de fala candidata(s)`.
- Continua sem OCR, Tesseract, tradução, download de modelos ou requisições externas.

## Observações das duas capturas fornecidas

Na imagem do Batman no leitor, os candidatos visíveis correspondem a quatro grupos de fala:
1. `IT'S INESCAPABLE. ISN'T IT?` (quadro retangular);
2. `THE SADNESS.` (lobo oval superior esquerdo);
3. `BUT THE QUESTION IS, BRUCE...` (lobo inferior adjacente, separado da fala 2);
4. `...WHAT WILL YOU DO WITH IT?` (balão inferior).

Ao rodar uma reprodução local dos componentes visuais e da regra de agrupamento sobre os dois screenshots, foram obtidos quatro recortes menores e independentes por captura. Isso é uma validação **restrita aos dois exemplos enviados**, não uma homologação geral. Imagens estilizadas ou com letras pequenas/coloridas podem produzir erros.

## Teste de aceite no navegador

1. Desative o Finder antigo em `chrome://extensions` / `edge://extensions`.
2. Baixe `PageTranslator-Finder-v0.3.2-preview` do workflow da branch `fix/browser-v0.3.2-isolated-speech`, extraia e carregue a pasta que contém `manifest.json`.
3. Abra a mesma página de HQ, recarregue-a e selecione **Quadrinhos → Identificar imagens (Finder)**.
4. Confirme se há uma caixa para cada uma das quatro falas acima, sem um recorte grande envolvendo janela e dois balões.
5. Clique nas caixas individuais: detalhes exibem número de linhas, coordenadas e alerta se houver sobreposição de conteúdo estimado.
6. Caixas amarelas podem se tocar ou cruzar bordas. **Caixas vermelhas indicam risco de incluir letras de outra fala**: registrar screenshot para análise.
7. Repita após rolar e em Chrome e Edge. A seleção manual deve continuar disponível sem inicializar OCR.

## Limitações e próximas etapas

A heurística de agrupamento não entende semanticamente palavras nem os limites exatos de um balão. O marcador de risco opera sobre tinta e recortes estimados; não garante precisão de 100%. Se o Finder detectar uma caixa vermelha, é preciso revisar antes de habilitar OCR/tradução automática naquela região. O objetivo da etapa seguinte é processar somente recortes **confirmados como isolados**, com timeout e eventual OCR alternativo se Tesseract continuar travando.

A versão Android e releases anteriores não são alteradas nesta branch.
