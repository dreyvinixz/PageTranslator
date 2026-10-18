# PageTranslator — QA / v1.0.0 (preview)

## Testes obrigatórios em um celular Android

- [ ] Instalar o APK debug e abrir a atividade principal
- [ ] Negar e conceder permissão de sobreposição sem travamento
- [ ] Negar e conceder captura de tela; a captura só deve ocorrer após autorização
- [ ] Voltar a uma HQ em inglês no Chrome; verificar OCR/EN→PT após download do modelo
- [ ] Verificar botão ON/OFF e continuidade da rolagem da HQ
- [ ] Encerrar pela notificação; confirmar remoção da janela e fim da captura
- [ ] Bloquear a tela e alternar aplicativos; não deixar captura persistente após parar
- [ ] Testar Android 14+ (consentimento MediaProjection por sessão)
- [ ] Testar tela em paisagem e mudança de orientação (pode exigir reiniciar captura)
- [ ] Verificar textos longos, nomes próprios, fontes estilizadas e caixas fora do lugar
- [ ] Validar funcionamento sem rede após download dos modelos
- [ ] Confirmar que apps protegidos contra captura não são contornados

## Limites conhecidos

- OCR encontra blocos de texto, não contornos semânticos de balões.
- O posicionamento em aparelhos com barras de navegação, recortes de tela e janelas parciais pode estar desalinhado.
- Conteúdo altamente estilizado pode falhar no OCR.
- O modelo de tradução requer rede para baixar uma primeira vez.
- O APK é de debug, com assinatura efêmera de CI; destinado apenas a testes.
- Não foram executados testes físicos de dispositivo nem avaliações de acessibilidade nesta versão.

## Critério de liberação

A Action do GitHub só publica o **pré-lançamento** `v1.0.0` se `assembleDebug` for concluído com sucesso. Compilação **não substitui** QA no dispositivo.
