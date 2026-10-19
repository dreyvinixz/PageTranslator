# PageTranslator Browser v0.2.2 — Estabilidade do OCR (Preview)

Hotfix experimental para Chrome e Edge após o relato de travamento na HQ em batcave.biz/reader/683/3907#page-3. Esta versão substitui a v0.2.0 como candidata a teste para a extensão, sem alterar o APK Android.

## Correções

- O painel deixa de ficar oculto durante todo o processamento OCR: reaparece após a captura, com indicadores de progresso por fase.
- Leitura automática serializada no service worker: evita capturas concorrentes e leituras sobrepostas.
- Timeout explícito de 45 segundos para OCR; falhas de comunicação ou travamento tentam reinicializar o documento offscreen.
- Após falhas, a interface mostra a mensagem de erro e pede **Atualizar**. Não reinicia infinitamente.
- Desativa observação pesada de mutações em páginas de HQ com lazy-loading; usa scroll/resize/load e intervalo mínimo maior para novas análises.
- Canvas OCR limitado e recortado às regiões ocupadas pelas imagens visíveis; captura JPEG para reduzir tráfego interno.
- Reconhecimento ainda usa Tesseract.js v6 no dispositivo; nenhuma captura é enviada a servidores externos.
- A tradução online permanece opcional e exige consentimento explícito.

## Instalação

1. Baixe o asset **PageTranslator-browser-v0.2.2-preview.zip** e extraia até visualizar **manifest.json**.
2. Acesse **chrome://extensions** ou **edge://extensions**, ative **Modo do desenvolvedor**.
3. **Remova a instalação unpacked anterior** ou desative-a para evitar duas extensões concorrendo pela mesma página.
4. Use **Carregar sem compactação** selecionando a nova pasta, e atualize a aba da HQ.
5. Clique no ícone PageTranslator para iniciar. Verifique as fases "Capturando", "Preparando OCR" e "Reconhecendo".
6. Se o OCR falhar, copie a mensagem do painel ou do console da extensão (Detalhes → Inspecionar service worker).

## Privacidade

OCR local. A tradução remota por MyMemory continua desligada por padrão. Depois de consentir, apenas textos OCR são transmitidos ao serviço, com até 30 solicitações por sessão.

## Validação

O pipeline automatizado executa build, testes de heurística e teste simulado do recorte e coordenadas. A execução em Chrome/Edge real ainda precisa ser homologada; esta é uma **pré-release**, não uma versão estável. O desempenho varia conforme hardware, tamanho e estilo gráfico da HQ. Verifique a issue #8 e o PR de correção.

## Integridade

Confira o asset **PageTranslator-browser-v0.2.2-preview.zip.sha256** usando o comando PowerShell Get-FileHash com algoritmo SHA256.
