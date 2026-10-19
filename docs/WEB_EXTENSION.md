# PageTranslator Browser — v0.2.0 Preview (Chrome e Edge)

Extensão Chromium Manifest V3 experimental. A v0.2.0 introduz **detecção automática de regiões de texto** em imagens de HQs visíveis; usa Tesseract.js v6 (OCR local) e sobrepõe a tradução, quando disponível. Não segmenta geometricamente o contorno dos balões: o agrupamento é uma heurística de proximidade de linhas OCR.

## Instalação

1. Abra **Actions → Browser Extension · Preview**, selecione uma execução bem-sucedida da branch/PR de v0.2.0.
2. Baixe o artifact **PageTranslator-browser-v0.2.0-preview** e extraia-o. Se contiver outro ZIP, extraia também até encontrar **manifest.json** e a pasta **vendor/**.
3. Chrome: **chrome://extensions**; Edge: **edge://extensions**. Ative **Modo do desenvolvedor**.
4. Escolha **Carregar sem compactação** e aponte para a pasta com **manifest.json**.
5. Abra um leitor de HQ HTTP(S) e clique no ícone do PageTranslator.

## Modo automático

- **Um clique na extensão** inicia a identificação automática na aba ativa; outro clique desliga o modo.
- Procura imagens grandes e canvases visíveis, ignora por padrão menus e imagens pequenas. Botão **Página toda** amplia o OCR para a tela inteira, útil para leitores que desenham a HQ em CSS ou canvas não detectado.
- Identifica até **10 regiões visíveis** por passagem. As linhas com OCR suficientemente confiável são agrupadas por proximidade vertical e alinhamento horizontal, sem garantia de que correspondam a balões verdadeiros.
- As falas aparecem como pequenas sobreposições. **Clique em uma sobreposição** para alternar a frase original e a tradução.
- Ao **rolar ou redimensionar**, as sobreposições antigas são removidas imediatamente. A extensão aguarda o fim do movimento e faz uma nova captura do conteúdo visível. Não percorre páginas fora da tela.
- **Atualizar** força nova leitura (observando um intervalo mínimo); **Seleção manual** abre o modo da v0.1.0; **Desligar** encerra a sessão.
- A API de tradução **local** do navegador é usada quando estiver disponível; caso contrário, as regiões ficam originalmente em inglês até que o usuário autorize a tradução online.

## Privacidade e tradução

- OCR e processamento de imagens executam-se **localmente**, em um documento offscreen da extensão, com Tesseract.js e modelo de inglês empacotados. A captura permanece somente em memória; a extensão não salva quadrinhos ou screenshots.
- Por padrão, a extensão **não envia texto a terceiros**. Ao clicar em **Online: ativar**, o usuário autoriza que *os textos OCR reconhecidos na aba continuem sendo enviados automaticamente à MyMemory conforme rola a página*, até clicar em **Online: desligar** ou **Desligar**. Não use esse modo em páginas com informações confidenciais.
- No máximo **30 solicitações online por sessão**; cache em memória de traduções repetidas. Cada solicitação envia somente texto, nunca a imagem, à API externa via HTTPS. A política e os limites dessa API externa são independentes do PageTranslator.
- Permissões: activeTab temporária, scripting, offscreen e acesso de rede apenas ao serviço de tradução. Sem all_urls e sem scripts remotos.

## Implementação

- browser-extension/auto-content.js: modo automático, eventos de scroll/resize, painel, marcadores e controle de consentimento.
- browser-extension/content.js: preserva seleção manual da v0.1.0.
- browser-extension/background.js: valida a aba ativa, impõe intervalo entre capturas e roteia OCR / tradução.
- browser-extension/offscreen.js: máscara das regiões de imagem, OCR em uma captura, leitura de blocos (Tesseract v6).
- browser-extension/regions.js: regras de agrupamento das linhas OCR em regiões.
- browser-extension/tests/regions.test.mjs: testes de agrupamento, confiança, colunas e coordenadas.

## Desenvolvimento

Requer Node.js 22 para compilar:

    cd browser-extension
    npm install
    npm test
    npm run build
    npm run verify

Carregue **browser-extension/dist/** em chrome://extensions ou edge://extensions.

## Limites e plano de QA

- **Não é detecção semântica do balão**. A heurística pode unir textos próximos de balões distintos ou separar um balão em mais de uma região. Quadrinhos com letras estilizadas, fundo ruidoso e texto inclinado podem falhar.
- Tradução local depende da disponibilidade da Translator API do Chrome/Edge e do modelo no dispositivo; se não existir, precisa consentimento explícito para MyMemory.
- OCR da área visível, não do conteúdo completo da página; até 10 sobreposições por passagem, limitações de desempenho de CPU e proteção das páginas continuam aplicáveis.
- Intervalo entre scans superior ao teto de 2 capturas/s de captureVisibleTab; nada é capturado em abas de fundo.
- Antes de publicar em loja: testar Chrome + Edge reais, zoom 80/100/125%, HiDPI, rolagem rápida, atualização de imagens lazy-load, iframe, modo paisagem, troca de abas, captura bloqueada, latência, consumo de memória, frases multilinha e falso agrupamento.
- Os testes de CI verificam **estrutura, código e heurísticas**; não comprovam uma experiência de leitura fluida. Usar capturas de HQ autorizadas para a homologação e registrar os erros de OCR e tradução.

## Evoluções futuras

Reconhecimento de contornos de balões com visão computacional, agrupamento por painéis e ordem de leitura, edição visual discreta da fala, tradução contextual, indicador de confiança e modo aprendizado EN/PT. A versão Android continua independente.
