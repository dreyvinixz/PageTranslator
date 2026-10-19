# PageTranslator Browser v0.2.0 — Preview

Primeira pré-release da extensão PageTranslator para Google Chrome e Microsoft Edge (Chromium Manifest V3), independente do APK Android v1.0.0.

## Funcionalidades

- Detecção automática de até 10 regiões de texto visíveis em imagens e canvases do leitor de HQ.
- OCR local com Tesseract.js v6, modelo inglês e WASM incluídos no pacote.
- Agrupamento heurístico de linhas por posição e proximidade, aproximando regiões de balões.
- Atualização das sobreposições após rolagem ou redimensionamento.
- Alternância entre inglês original e texto traduzido ao clicar nas sobreposições.
- Tradução local pelo navegador quando a Translator API estiver disponível.
- Tradução remota MyMemory somente após consentimento em **Online: ativar**, com até 30 pedidos por sessão.
- Seleção manual da v0.1.0 preservada como alternativa.

## Instalação Chrome/Edge

1. Em **Assets**, baixe **PageTranslator-browser-v0.2.0-preview.zip**.
2. Extraia o ZIP: a pasta extraída deve conter **manifest.json**, **background.js** e a pasta **vendor/**.
3. Abra **chrome://extensions** no Chrome ou **edge://extensions** no Edge.
4. Ative **Modo do desenvolvedor** e clique em **Carregar sem compactação**.
5. Selecione a pasta extraída; abra uma HQ em página HTTP(S) e clique no ícone PageTranslator.
6. Se o navegador não oferecer tradução local, use **Online: ativar** somente se concordar com o envio dos textos reconhecidos ao serviço externo MyMemory.

**Não é APK.** A extensão ainda não foi publicada na Chrome Web Store ou Edge Add-ons.

## Integridade

O asset **PageTranslator-browser-v0.2.0-preview.zip.sha256** contém o checksum SHA-256 do pacote. No PowerShell, confira com Get-FileHash usando algoritmo SHA256.

## Estado de validação

- **CI:** build, empacotamento, validação de arquivos e 7 testes unitários de agrupamento OCR aprovados.
- **Homologação funcional em Chrome e Edge reais:** **PENDENTE** (issue #8).
- A detecção se baseia em regiões OCR, não em contornos perfeitos de balões. Podem ocorrer erros de OCR, fusões indevidas de falas e sobreposições.
- A imagem não é enviada ao serviço externo. A tradução online transmite somente o texto reconhecido após autorização.
- **Pré-release experimental**, não uma versão estável.
