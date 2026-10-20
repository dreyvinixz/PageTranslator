import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const ctx={};ctx.globalThis=ctx;
vm.runInNewContext(readFileSync(join(import.meta.dirname,"..","regions.js"),"utf8"),ctx);
const {groupLinesConservative}=ctx.PageTranslatorRegions;
const line=(text,x,y,w,h)=>({text,confidence:91,bbox:{x0:x,y0:y,x1:x+w,y1:y+h}});
test("OCR lines from same speech form independent multiline region",()=>{
 const result=groupLinesConservative([
  line("POR QUE",20,20,80,12),line("BRUCE?",27,36,69,12)
 ]);
 assert.equal(result.length,1);
 assert.equal(result[0].lineCount,2);
 assert.equal(result[0].text,"POR QUE BRUCE?");
});
test("two close aligned speeches split rather than contaminating OCR",()=>{
 const result=groupLinesConservative([
  line("THE SADNESS",20,20,100,12),line("IT'S INESCAPABLE",19,48,114,12)
 ]);
 assert.equal(result.length,2);
 assert.notEqual(result[0].text,result[1].text);
});
test("text blocks side by side stay independent despite overlapping vertical ranges",()=>{
 const result=groupLinesConservative([
  line("EU TENHO",10,40,65,15),line("YOU KNOW",110,42,70,15)
 ]);
 assert.equal(result.length,2);
});
test("malformed results are ignored and output is bounded",()=>{
 const result=groupLinesConservative([{text:"broken",bbox:{x0:0,y0:3,x1:0,y1:8}},
  ...Array.from({length:50},(_,i)=>line("word"+i,i*100,10,60,10))],12);
 assert.ok(result.length<=12);
});
