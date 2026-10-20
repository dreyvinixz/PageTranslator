"use strict";
// Extension-owned offscreen OCR. No screenshots or OCR text are persisted/sent online.
const workers = new Map();
let serial = Promise.resolve();
function initWorker(language) {
  const key=language==="por"?"por":language==="eng"?"eng":"por+eng";
  if(!workers.has(key)){
    const langs=key==="por+eng"?["por","eng"]:[key];
    workers.set(key,Tesseract.createWorker(langs,1,{
      workerPath:chrome.runtime.getURL("vendor/worker.min.js"),
      corePath:chrome.runtime.getURL("vendor/core"),
      langPath:chrome.runtime.getURL("vendor/lang"),
      workerBlobURL:false,gzip:true,cacheMethod:"none"
    }).catch(error=>{workers.delete(key);throw error;}));
  }
  return workers.get(key);
}
async function recognize(image,lang){
  if(typeof image!=="string"||!/^data:image\/(png|jpeg);base64,/.test(image)||
    image.length>6_000_000)throw Error("Recorte inválido ou muito grande.");
  const photo=new Image();
  photo.src=image;await photo.decode();
  if(!photo.naturalWidth||!photo.naturalHeight||
     photo.naturalWidth*photo.naturalHeight>2500000)throw Error("OCR: limite de pixels excedido.");
  const canvas=document.createElement("canvas");
  canvas.width=photo.naturalWidth;canvas.height=photo.naturalHeight;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)throw Error("Canvas do OCR indisponível.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(photo,0,0);
  photo.src="";
  try{
    const worker=await initWorker(lang);
    const answer=await worker.recognize(canvas,{}, {blocks:true});
    return {text:String(answer.data?.text||"").trim().slice(0,4000),
      confidence:Number(answer.data?.confidence||0),
      lines:PageTranslatorRegions.collectLines(answer.data?.blocks,1,1,canvas.width,canvas.height)};
  }finally{canvas.width=0;canvas.height=0;}
}
chrome.runtime.onMessage.addListener((m,_sender,respond)=>{
 if(m?.target!=="PT_OFFSCREEN"||m.type!=="PT_OCR_CROP")return;
 serial=serial.catch(()=>{}).then(()=>recognize(m.image,m.language));
 serial.then(r=>respond({ok:true,...r})).catch(e=>respond({ok:false,error:String(e.message||e)}));
 return true;
});
