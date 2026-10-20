import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const dir=join(import.meta.dirname,"..");
const ctx={setTimeout,clearTimeout};ctx.globalThis=ctx;
vm.runInNewContext(readFileSync(join(dir,"finder-ocr-runtime.js"),"utf8"),ctx);
const {deadline,createGate}=ctx.PageTranslatorOCRRuntime;
test("deadline distinguishes capture timeout explicitly",async()=>{
 let timeoutCallback;
 const clock={setTimeout(fn){timeoutCallback=fn;return 1;},clearTimeout(){}};
 const pending=deadline(()=>new Promise(()=>{}),10,"CAPTURE_TIMEOUT","Capture stalled",clock);
 await Promise.resolve();timeoutCallback();
 await assert.rejects(pending,e=>e.code==="CAPTURE_TIMEOUT" &&
  e.detail.timeoutMs===10 && e.message==="Capture stalled");
});
test("worker init and recognition have independent stage identifiers",async()=>{
 for(const [code,message] of [["OCR_INIT_TIMEOUT","Models failed"],
   ["OCR_RECOGNITION_TIMEOUT","Reading stalled"]]){
  let trigger;
  const p=deadline(()=>new Promise(()=>{}),123,code,message,
   {setTimeout:fn=>{trigger=fn;return 1;},clearTimeout(){}});
  await Promise.resolve();trigger();
  await assert.rejects(p,e=>e.code===code);
 }
});
test("only one queued OCR request can hold the worker",async()=>{
 const gate=createGate();let release;
 const first=gate.execute(()=>new Promise(resolve=>{release=resolve;}));
 assert.equal(gate.busy,true);
 await assert.rejects(gate.execute(()=>Promise.resolve()),e=>e.code==="OCR_BUSY");
 release("ok");
 assert.equal(await first,"ok");
 assert.equal(gate.busy,false);
 assert.equal(await gate.execute(()=>Promise.resolve("again")),"again");
 assert.equal(gate.serial,2);
});
test("invalid OCR operation still releases the gate",async()=>{
 const gate=createGate();
 await assert.rejects(gate.execute(async()=>{throw Error("worker crashed");}));
 assert.equal(gate.busy,false);
});
test("service worker uses supported contexts and named OCR stages",()=>{
 const bg=readFileSync(join(dir,"background.js"),"utf8");
 const off=readFileSync(join(dir,"finder-offscreen.js"),"utf8");
 assert.match(bg,/chrome\.runtime\.getContexts/);
 assert.match(bg,/PT_OCR_PREPARE/);
 assert.match(bg,/OCR_INIT_TIMEOUT/);
 assert.match(bg,/OCR_RECOGNITION_TIMEOUT/);
 assert.match(bg,/CAPTURE_TIMEOUT/);
 assert.match(bg,/resetOCRDocument/);
 assert.match(off,/PT_OCR_CROP/);
 assert.doesNotMatch(bg,/A captura demorou além do limite/);
});
