/* Execute the SAME Finder pixel algorithms on a raw RGBA page.
   Usage: node scripts/vision-evaluate.mjs <width> <height> < image.rgba
   Output: metadata only; never save copyrighted pixels or recognized words. */
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const root=join(import.meta.dirname,"..");
const w=Number(process.argv[2]),h=Number(process.argv[3]);
if(!Number.isInteger(w)||!Number.isInteger(h)||w<50||h<50||w*h>1_500_000)
  throw Error("Expected a bounded image with width and height.");
const buf=readFileSync(0);
if(buf.byteLength!==w*h*4)throw Error("Expected exactly width*height*4 RGBA bytes.");
const ctx={};ctx.globalThis=ctx;
for(const file of ["finder-core.js","finder-panels.js","finder-text.js","finder-fit.js",
 "finder-instances.js"]) {
  vm.runInNewContext(readFileSync(join(root,file),"utf8"),ctx,{filename:file});
}
const image={width:w,height:h,data:new Uint8ClampedArray(buf.buffer,
  buf.byteOffset,buf.byteLength)};
const allowed=[{x:0,y:0,width:w,height:h}];
const start=performance.now();
const panels=ctx.PageTranslatorPanels.findPanels(image,allowed,{maxDepth:4});
const safePanels=panels.length?panels:[{id:"panel-1",rect:allowed[0]}];
const words=safePanels.flatMap(p=>
  ctx.PageTranslatorTextCandidates.findTextCandidates(image,[p.rect],{limit:8})
    .map(t=>({...t,panelRect:p.rect,panelId:p.id})));
const candidates=ctx.PageTranslatorPanels.confineTextToPanels(words,safePanels);
const shapes=ctx.PageTranslatorFinderCore.findLightRegions(image,allowed,{limit:20})
  .flatMap(s=>safePanels.map(p=>{
    const rect=ctx.PageTranslatorPanels.intersect(s.rect,p.rect);
    return rect&&rect.width*rect.height>=220?{...s,rect,panelId:p.id}:null;
  }).filter(Boolean));
const instances=ctx.PageTranslatorInstances.buildInstances(image,shapes,candidates);
const result={
 width:w,height:h,
 panels:safePanels.map(p=>({id:p.id,rect:p.rect})),
 textCandidates:candidates.length,
 provisionalInstances:instances.length,
 requiresReview:instances.filter(i=>i.status==="REVIEW_REQUIRED").length,
 connectedShapeSplits:instances.filter(i=>i.splitFromConnectedShape).length,
 bboxOutsidePanel:instances.filter(i=>{
   const panel=safePanels.find(p=>p.id===candidates[
      Number(i.textGroupId.slice(5))-1]?.panelId);
   return !panel||!ctx.PageTranslatorPanels.insideRect(i.bbox,panel.rect);
 }).length,
 elapsedMs:Math.round(performance.now()-start)
};
console.log(JSON.stringify(result));
