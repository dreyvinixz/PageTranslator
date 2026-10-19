# PageTranslator Finder v0.3.3 — Enquadramento dos balões

Esta versão de diagnóstico ajusta o enquadramento visual das regiões de texto, especialmente para os balões **#6 ("THE SADNESS")** e **#5 ("IT'S INESCAPABLE…")** nos prints do leitor. Não há OCR nem tradução nesta versão.

## O que mudou

- Separa dois conceitos: `inkRect` (a região mínima das letras, usada para atribuir a fala) e `rect` (caixa visual proposta, usada como enquadramento).
- Novo `finder-fit.js` faz busca limitada nas quatro direções para encontrar margens claras/neutras em torno de cada bloco textual, sem reconstruir a imagem e sem fazer OCR.
- A busca tolera traços escuros finos da borda do balão, mas interrompe a expansão quando deixa a região de fundo claro. Se não há limite confiável, conserva o recorte justo ao texto.
- Antes de aceitar a nova caixa, verifica se ela incluiria `inkRect` de outra fala. Reduz a expansão pelo lado que preserva todo o texto da fala atual com menor perda de área; regiões ambíguas são sinalizadas para revisão.
- Mantém a validação anterior para sobreposição: dois contornos podem se cruzar, mas uma caixa não pode abrigar letras de outra fala.
- Pacote continua mínimo: sem Tesseract, permissões apenas activeTab e scripting, sem redes externas, captura somente ao clicar no Finder Quadrinhos.

## Evidência limitada com o print enviado

Em uma simulação de bordas sobre os pixels do screenshot fornecido, partindo de caixas aproximadas:

- Balão #6 "THE SADNESS": a borda **esquerda** estimada se deslocou de aproximadamente x=175 para x=135, aproximando-se do balão visível (por volta de x=132).
- Caixa #5 "IT'S INESCAPABLE": a borda **superior** estimada passou de aproximadamente y=186 para y=177, incluindo a margem acima do texto.
- A caixa de #6 precisa ser limitada pela área de tinta da fala #3, caso contrário a expansão inferior poderia gerar mistura. O refinamento faz essa proteção.
- As coordenadas são da **captura específica de 1585×977 pixels** e não devem ser tomadas como dimensões absolutas do DOM ou promessa de encaixe exato.

## Teste no Chrome / Edge

1. Desative a extensão anterior e instale o artifact `PageTranslator-Finder-v0.3.3-preview` da branch `fix/browser-v0.3.3-balloon-framing` (extraia até `manifest.json`, selecione Carregar sem compactação).
2. Recarregue a página https://batcave.biz/reader/683/3907#page-3.
3. Selecione **Quadrinhos → Identificar imagens (Finder)**.
4. Confirme se #6 agora cobre a parte branca à esquerda de "THE SADNESS" e #5 cobre a moldura superior.
5. Confira se as quatro falas permanecem separadas e se não existem caixas vermelhas (risco de mistura).
6. Clique em cada caixa para ler o campo **Enquadramento** ("expandido até a margem visual provável", "justo ao texto" ou "revisão manual necessária").
7. Envie screenshot para avaliação visual; até essa validação, não considerar a versão homologada.

## Limitações

Não reproduz com exatidão contornos ovais ou caudas de balões, nem detecta semanticamente falas. A busca atual se apoia em fundo claro com letras escuras; balões coloridos ou escuros podem continuar com enquadramento justo ao texto. O ajuste visa retângulos de leitura com baixa mistura, não segmentação perfeita.

Os testes automatizados incluem regressões sintéticas de margens, moldura escura fina, falas vizinhas, balões escuros e proteção contra fusão. Não substituem o QA visual no Chrome e Edge reais.
