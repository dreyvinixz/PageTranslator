/* On-device, conservative language inference and Chromium Translator API adapter. */
(function(root) {
"use strict";
const languages={pt:"Português",en:"English",es:"Español",fr:"Français"};
const lex={
 pt:new Set(["não","nao","você","voce","que","com","para","uma","mais","está","esta","isso","ele","ela","mas","nós","nos","meu","sei","tudo","aqui","porque","por","como"]),
 en:new Set(["the","and","you","are","what","this","that","with","for","but","know","your","was","there","from","have","can","why","not","will","who","where"]),
 es:new Set(["que","con","para","una","pero","por","está","esta","como","eres","hay","tengo","nosotros","usted","eres","gracias"]),
 fr:new Set(["avec","pour","une","mais","vous","nous","quoi","pourquoi","elle","est","pas","dans","suis","merci","bonjour"])
};
function lexical(text){
 const words=String(text||"").toLocaleLowerCase().match(/[\p{L}]+/gu)||[];
 if(words.length<3)return {language:"und",confidence:0,method:"insufficient-text"};
 const scores=Object.entries(lex).map(([language,vocab])=>
  ({language,count:words.filter(w=>vocab.has(w)).length})).sort((a,b)=>b.count-a.count);
 if(scores[0].count<2||scores[0].count<=scores[1].count)return {
  language:"und",confidence:0,method:"ambiguous-lexicon"
 };
 return {language:scores[0].language,confidence:Math.min(.79,scores[0].count/words.length),
   method:"lexicon-heuristic"};
}
async function detect(text,preferred="auto",api=root) {
 if(preferred!=="auto")return {language:languages[preferred]?preferred:"und",
   confidence:1,method:"user-selected"};
 if(typeof api.LanguageDetector==="function"){
   try {
     const availability=await api.LanguageDetector.availability();
     if(availability==="available"){
       const detector=await api.LanguageDetector.create();
       const predictions=await detector.detect(String(text).slice(0,2000));
       detector.destroy?.();
       const first=predictions?.find(x=>x.detectedLanguage in languages);
       if(first&&first.confidence>=.70)return {language:first.detectedLanguage,
         confidence:first.confidence,method:"chrome-language-detector"};
     }
   }catch(_){/* no model or disallowed environment; conservative fallback */ }
 }
 return lexical(text);
}
async function availability(source,target,api=root){
 if(!(source in languages)||!(target in languages)||source===target)
   return source===target?"same-language":"unsupported";
 if(typeof api.Translator?.availability!=="function")return "unavailable";
 try{return await api.Translator.availability({sourceLanguage:source,targetLanguage:target});}
 catch(_){return "unavailable";}
}
// Begin creation directly in a user click handler: downloads require user activation.
function startTranslation(text,source,target,api=root){
 if(!(source in languages)||!(target in languages))throw Error("Idioma não suportado.");
 if(source===target)return Promise.resolve(String(text));
 if(typeof api.Translator?.create!=="function")throw Error("Translator API indisponível neste navegador.");
 const translatorPromise=api.Translator.create({sourceLanguage:source,targetLanguage:target});
 return translatorPromise.then(async translator=>{
   try{return await translator.translate(String(text).slice(0,4000));}
   finally{translator.destroy?.();}
 });
}
root.PageTranslatorLanguage={languages,lexical,detect,availability,startTranslation};
})(typeof globalThis==="object"?globalThis:self);
