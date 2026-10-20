"use strict";
importScripts("finder-ocr-runtime.js");
const Runtime=globalThis.PageTranslatorOCRRuntime;
const jobs=Runtime.createGate();
let offscreenInit=null;
let offscreenReady=false;
async function hasOCRDocument(){
  // Chrome 116+; chrome.offscreen.hasDocument is not present in older Chrome.
  if(typeof chrome.runtime.getContexts==="function"){
    const contexts=await chrome.runtime.getContexts({
      contextTypes:["OFFSCREEN_DOCUMENT"],
      documentUrls:[chrome.runtime.getURL("finder-offscreen.html")]
    });
    return contexts.length>0;
  }
  if(typeof chrome.offscreen.hasDocument==="function")return chrome.offscreen.hasDocument();
  throw new Runtime.OCRStageError("OCR_CONTEXT_UNAVAILABLE",
    "O navegador não oferece consulta compatível de documento offscreen.");
}
async function ensureOCRDocument(){
  if(await hasOCRDocument())return;
  if(!offscreenInit)offscreenInit=chrome.offscreen.createDocument({
    url:"finder-offscreen.html",reasons:["BLOBS"],
    justification:"Reconhecer localmente textos de recortes solicitados, sem servidor remoto"
  }).finally(()=>{offscreenInit=null;});
  await offscreenInit;
}
async function resetOCRDocument(){
  offscreenReady=false;
  try{if(await hasOCRDocument())await chrome.offscreen.closeDocument();}
  catch(e){console.warn("[PageTranslator][OCR_RESET]",String(e?.message||e));}
}
function visibleTab(sender){
  if(!sender.tab?.id || !/^https?:\/\//.test(sender.tab.url||""))
    throw new Runtime.OCRStageError("TAB_UNAVAILABLE",
      "O OCR somente funciona após abrir o Finder em uma aba web.");
  return chrome.tabs.query({active:true,windowId:sender.tab.windowId}).then(list=>{
    if(list[0]?.id!==sender.tab.id)throw new Runtime.OCRStageError("TAB_INACTIVE",
      "A aba mudou durante a operação; ative novamente e tente.");
  });
}
async function sendOffscreen(type,extra,timeoutMs,code,description){
  return Runtime.deadline(() => chrome.runtime.sendMessage({
    target:"PT_OFFSCREEN",type,...extra
  }),timeoutMs,code,description);
}
function explain(error,stage){
  const code=error.code||"OCR_FAILED";
  console.error("[PageTranslator]["+code+"]",stage,error);
  return {ok:false,code,stage,error:String(error.message||error)};
}
chrome.action.onClicked.addListener(async tab=>{
  if(!tab.id||!/^https?:\/\//.test(tab.url||""))return;
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:[
      "finder-core.js","finder-panels.js","finder-text.js","finder-fit.js",
      "finder-association.js","finder-instances.js","finder-language.js",
      "finder-shortcut.js","finder-auto.js","regions.js","finder-content.js"
    ]});
    await chrome.tabs.sendMessage(tab.id,{type:"PT_FINDER_OPEN"});
  }catch(error){console.error("PageTranslator Finder: falha ao abrir.",error);}
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==="PT_FINDER_OCR"){
    (async()=>{
      await visibleTab(sender);
      if(typeof message.image!=="string"||message.image.length>6_000_000)
        throw new Runtime.OCRStageError("OCR_INPUT_INVALID","Recorte OCR inválido ou grande demais.");
      const language=["por","eng","por+eng"].includes(message.language)
        ?message.language:"por+eng";
      return jobs.execute(async id=>{
        let stage="offscreen",start=performance.now(),initMs=0,ocrMs=0;
        try{
          await Runtime.deadline(ensureOCRDocument,12000,"OCR_DOCUMENT_TIMEOUT",
            "Tempo limite ao abrir o documento OCR (12 s).");
          stage="worker-initialization";
          const init=performance.now();
          const ready=await sendOffscreen("PT_OCR_PREPARE",{language,id},50000,
            "OCR_INIT_TIMEOUT","Inicialização dos modelos OCR excedeu 50 s.");
          if(!ready?.ok)throw new Runtime.OCRStageError("OCR_INIT_FAILED",
            ready?.error||"Falha ao inicializar o OCR.");
          initMs=Math.round(performance.now()-init);
          offscreenReady=true;
          stage="recognition";
          const step=performance.now();
          const result=await sendOffscreen("PT_OCR_CROP",{
            image:message.image,language,id
          },35000,"OCR_RECOGNITION_TIMEOUT",
            "Reconhecimento OCR excedeu 35 s. Tente selecionar um balão menor.");
          if(!result?.ok)throw new Runtime.OCRStageError("OCR_RECOGNITION_FAILED",
            result?.error||"OCR não produziu resposta.");
          ocrMs=Math.round(performance.now()-step);
          return {text:result.text,confidence:result.confidence,lines:result.lines,
            diagnostics:{jobId:id,initMs,ocrMs,totalMs:Math.round(performance.now()-start),
              workerReused:ready.reused===true}};
        }catch(error){
          if(/TIMEOUT|OCR_INIT_FAILED|OCR_RECOGNITION_FAILED/.test(error.code||"")){
            await resetOCRDocument(); // Abort the stuck worker and drop its pending queue.
          }
          error.stage=stage;
          throw error;
        }
      });
    })().then(out=>sendResponse({ok:true,...out}))
      .catch(error=>sendResponse(explain(error,error.stage||"ocr")));
    return true;
  }
  if(message?.type!=="PT_FINDER_CAPTURE")return;
  (async()=>{
    await visibleTab(sender);
    const started=performance.now();
    const image=await Runtime.deadline(()=>
      chrome.tabs.captureVisibleTab(sender.tab.windowId,{format:"jpeg",quality:72}),
      10000,"CAPTURE_TIMEOUT","Captura da aba excedeu 10 s.");
    if(!image?.startsWith("data:image/jpeg;base64,"))
      throw new Runtime.OCRStageError("CAPTURE_INVALID","Captura JPEG inválida.");
    return {image,diagnostics:{captureMs:Math.round(performance.now()-started)}};
  })().then(x=>sendResponse({ok:true,...x}))
    .catch(e=>sendResponse(explain(e,"capture")));
  return true;
});
