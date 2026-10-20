"use strict";
/* Offscreen OCR operates only on page-authorized crops.
   The background worker enforces per-stage timeouts and destroys this
   document if Tesseract stops responding; no durable jobs are retained. */
const workers=new Map();
const initializations=new Map();
let active=false;
async function initWorker(language){
  const key=language==="por"?"por":language==="eng"?"eng":"por+eng";
  if(workers.has(key))return {worker:workers.get(key),reused:true};
  if(!initializations.has(key)){
    const langs=key==="por+eng"?["por","eng"]:[key];
    const promise=Tesseract.createWorker(langs,1,{
      workerPath:chrome.runtime.getURL("vendor/worker.min.js"),
      corePath:chrome.runtime.getURL("vendor/core"),
      langPath:chrome.runtime.getURL("vendor/lang"),
      workerBlobURL:false,gzip:true,cacheMethod:"none"
    }).then(worker=>{workers.set(key,worker);return worker;})
      .catch(error=>{workers.delete(key);throw error;})
      .finally(()=>initializations.delete(key));
    initializations.set(key,promise);
  }
  return {worker:await initializations.get(key),reused:false};
}
async function recognize(image,language){
  if(typeof image!=="string"||!/^data:image\/(png|jpeg);base64,/.test(image)||
    image.length>6_000_000)throw Error("Recorte inválido ou muito grande.");
  const photo=new Image();photo.src=image;await photo.decode();
  if(!photo.naturalWidth||!photo.naturalHeight||
    photo.naturalWidth*photo.naturalHeight>2500000)throw Error("Limite de pixels do OCR excedido.");
  const canvas=document.createElement("canvas");
  canvas.width=photo.naturalWidth;canvas.height=photo.naturalHeight;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)throw Error("Canvas OCR indisponível.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(photo,0,0);photo.src="";
  try{
    const {worker}=await initWorker(language);
    const answer=await worker.recognize(canvas,{}, {blocks:true});
    return {text:String(answer.data?.text||"").trim().slice(0,4000),
      confidence:Number(answer.data?.confidence||0),
      lines:PageTranslatorRegions.collectLines(answer.data?.blocks,1,1,
        canvas.width,canvas.height)};
  }finally{canvas.width=0;canvas.height=0;}
}
chrome.runtime.onMessage.addListener((m,_sender,respond)=>{
  if(m?.target!=="PT_OFFSCREEN"||
     !["PT_OCR_PREPARE","PT_OCR_CROP"].includes(m.type))return;
  (async()=>{
    if(m.type==="PT_OCR_PREPARE"){
      if(active)throw Error("OCR_BUSY: reconhecimento em andamento.");
      const existed=workers.has(m.language);
      await initWorker(m.language);
      return {reused:existed};
    }
    if(active)throw Error("OCR_BUSY: o documento já está reconhecendo outro recorte.");
    active=true;
    try{return await recognize(m.image,m.language);}
    finally{active=false;}
  })().then(r=>respond({ok:true,...r}))
    .catch(error=>respond({ok:false,error:String(error.message||error)}));
  return true;
});
