/* PageTranslator OCR reliability utilities (service worker + Node tests).
   A deadline rejects the caller; the browser API must be recovered separately. */
(function(root) {
"use strict";
class OCRStageError extends Error {
  constructor(code, message, detail={}) {
    super(message); this.name="OCRStageError"; this.code=code; this.detail=detail;
  }
}
function deadline(job, ms, code, message, clock={}) {
  const set=clock.setTimeout||setTimeout, clear=clock.clearTimeout||clearTimeout;
  let timer;
  return Promise.race([
    Promise.resolve().then(job),
    new Promise((_, reject) => {timer=set(()=>
      reject(new OCRStageError(code,message,{timeoutMs:ms})),ms);})
  ]).finally(()=>clear(timer));
}
function createGate() {
  let busy=false, serial=0;
  return {
    get busy(){return busy;},
    get serial(){return serial;},
    async execute(action) {
      if(busy)throw new OCRStageError("OCR_BUSY",
        "Já existe um trabalho OCR em andamento. Aguarde ou tente novamente.");
      busy=true;const id=++serial;
      try{return await action(id);}finally{busy=false;}
    }
  };
}
root.PageTranslatorOCRRuntime={OCRStageError,deadline,createGate};
})(typeof globalThis==="object"?globalThis:self);
