import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const path=join(import.meta.dirname,"..");
const ctx={};ctx.globalThis=ctx;
vm.runInNewContext(readFileSync(join(path,"finder-language.js"),"utf8"),ctx);
const Language=ctx.PageTranslatorLanguage;
test("Portuguese text is detected without hard-coding comic language",()=>{
 const r=Language.lexical("Você não sabe o que está acontecendo aqui com ela");
 assert.equal(r.language,"pt");
 assert.equal(r.method,"lexicon-heuristic");
});
test("English text is detected; short and ambiguous text is unknown",()=>{
 assert.equal(Language.lexical("What are you going to do with the secret").language,"en");
 assert.equal(Language.lexical("Sim").language,"und");
 assert.equal(Language.lexical("Batman").language,"und");
});
test("explicit language overrides unavailable detector",async()=>{
 const a=await Language.detect("Não sei", "pt", {});
 assert.equal(a.language,"pt");
 assert.equal(a.method,"user-selected");
});
test("translation refuses unsupported pairs or missing browser API",async()=>{
 assert.equal(await Language.availability("pt","en",{}),"unavailable");
 assert.equal(await Language.availability("pt","pt",{}),"same-language");
 assert.throws(()=>Language.startTranslation("hello","en","pt",{}),/indisponível/);
 const calls=[];const api={Translator:{
  create:(options)=>{calls.push(options);return Promise.resolve({translate:async t=>"TR:"+t,destroy(){}});}
 }};
 assert.equal(await Language.startTranslation("hello","en","pt",api),"TR:hello");
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{sourceLanguage:"en",targetLanguage:"pt"}]);
});
test("automatic detection uses high-confidence Chrome detector when available",async()=>{
 const api={LanguageDetector:{
  availability:async()=>"available",
  create:async()=>({detect:async()=>[{detectedLanguage:"pt",confidence:.98}],destroy(){}})
 }};
 assert.equal((await Language.detect("uma frase","auto",api)).language,"pt");
});
