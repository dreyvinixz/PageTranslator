# Browser v0.2.3 Preview — Correção após teste de HQ em navegador

Estado: candidato experimental, não homologado; não publicar como release estável.

## O que mudou

1. **Entrada manual como padrão**: clicar no ícone mostra menu com "Selecionar balão" e "Automático (experimental)". Não inicia OCR de página inteira automaticamente.
2. **Uma seleção, um recorte**: o usuário arrasta sobre as letras ou balão. A extensão captura a aba visível por JPEG em memória e recorta **somente** a região escolhida antes do Tesseract.js local. Canvas limitado a aproximadamente 1,2 megapixel.
3. **Painel persistente**: após soltar o mouse, a interface mostra estado "Capturando" e "Reconhecendo" sem removê-la. Quando a seleção encosta no painel, ele fica oculto apenas durante o screenshot e reaparece após a captura.
4. **Timeout / recuperação**: limites de 12 s para captura/preparação e 45 s para OCR; se ocorrer travamento, exibe falha e permite voltar ao menu. Falha de comunicação não deve destruir o painel.
5. **Traduzir somente após reconhecimento**: duas opções, Translator API local quando disponível, ou envio de **somente texto** à MyMemory com clique explícito.
6. **Sobreposição aproximada**: depois de traduzir, cria uma caixa branca com bordas arredondadas sobre o retângulo escolhido, mantendo largura/altura/posição e opção de alternar EN/PT. Ainda não detecta o contorno orgânico exato do balão nem remove pixels perfeitamente.
7. **Modo automático**: continua experimental, acessível por botão separado. A volta à seleção manual aguarda confirmação de que ela abriu antes de fechar o painel automático.

## Por que o OCR ainda é necessário?

Na maior parte dos leitores de HQ o texto está **rasterizado dentro de uma imagem** e não pode ser obtido por DOM ou acessibilidade. Usamos OCR na imagem ou no recorte para obter texto e coordenadas, traduzimos apenas os caracteres e sobrepomos uma nova caixa na mesma localização. Se um futuro leitor expuser texto como DOM, podemos pular o OCR e ler textContent diretamente.

## Teste manual de regressão

1. Desative/remova instalações antigas da extensão, extraia o ZIP atual, carregue a pasta contendo manifest.json em chrome://extensions ou edge://extensions e **recarregue a aba**.
2. Abra https://batcave.biz/reader/683/3907#page-3 e clique no ícone PageTranslator. Deve abrir um menu sem iniciar OCR automaticamente.
3. Clique **Selecionar balão**, selecione o balão "IT'S INESCAPABLE. ISN'T IT?". O painel deve permanecer e mostrar progressão; se falhar, exibir erro sem desaparecer.
4. Confira o texto extraído e a posição. Clique **Traduzir online** apenas após decidir enviar o texto ao fornecedor. Verifique a caixa traduzida sobre a região selecionada.
5. Clique sobre a caixa para alternar EN/PT. Clique **Outro balão** sem reabrir a extensão. Repita 10 vezes e anote latência.
6. Teste cancelar por ESC, navegar/rolar e selecionar outro balão. Ao rolar, caixa antiga não deve sobrepor outra parte da página.
7. Teste separadamente **Automático (experimental)**, rolagem e **Seleção manual** para verificar que a transição de modo não deixa a interface sem controles.
8. Em caso de falha, abra chrome://extensions → PageTranslator → Service Worker → Inspecionar; informe a primeira mensagem de erro e versão do Chrome ou Edge.

## Escopo e limitações

A extensão não entende o conteúdo semântico nem o formato exato dos balões. Fontes de HQ estilizadas e balões pequenos podem gerar OCR incorreto; o fundo original continua por trás da caixa sobreposta. A tradução online transmite frases ao fornecedor somente após clique; não compartilha screenshots. Testes automatizados não equivalem à homologação visual.

## Critérios antes de release

- [ ] 10 seleções manuais consecutivas, sem desaparecer painel nem canal fechado.
- [ ] Tradução sobrepõe a região adequada, sem rolagem residual.
- [ ] Fluxo de voltar do automático para o manual funciona.
- [ ] Nenhuma chamada remota antes de consentimento.
- [ ] Uso de memória e latência aceitáveis em Chrome e Edge reais.
