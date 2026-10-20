import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const root=join(import.meta.dirname,"..");
const ctx={};ctx.globalThis=ctx;
vm.runInNewContext(readFileSync(join(root,"finder-instances.js"),"utf8"),ctx);
const detect=ctx.PageTranslatorInstances.buildInstances;
function image(w=180,h=110) {
 const data=new Uint8ClampedArray(w*h*4);
 for(let k=0;k<data.length;k+=4){data[k]=25;data[k+1]=40;data[k+2]=70;data[k+3]=255;}
 return {width:w,height:h,data};
}
function white(img,cx,cy,rx,ry) {
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++)
  if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1) {
    const k=(y*img.width+x)*4;
    img.data[k]=246;img.data[k+1]=247;img.data[k+2]=241;
  }
}
const t=(x,y,w,h)=>({inkRect:{x,y,width:w,height:h},rect:{x:x-4,y:y-4,width:w:w+8,height:h+8}});
const shape=(x,y,w,h)=>({shape:"rounded",rect:{x,y,width:w,height:h}});
function intersectsRun(runs,ink){
 return runs.some(([y,a,b])=>y>=ink.y&&y<ink.y+ink.height&&a<ink.x+ink.width&&b>ink.x);
}
test("two connected white ovals produce two disjoint masks and independent text ownership",()=>{
 const img=image();
 white(img,65,53,52,35);white(img,116,54,48,35);
 const txt=[t(50,42,23,10),t(112,45,26,10)];
 const shapes=[shape(12,17,155,77)]; // same connected bright region
 const out=detect(img,shapes,txt);
 assert.equal(out.length,2);
 assert.equal(out[0].splitFromConnectedShape,true);
 assert.equal(out[1].splitFromConnectedShape,true);
 assert.equal(out[0].sourceShapeId,"shape-1");
 assert.equal(out[1].sourceShapeId,"shape-1");
 assert.equal(out[0].risk,false);
 assert.equal(out[1].risk,false);
 assert.equal(intersectsRun(out[0].maskRuns,txt[1].inkRect),false);
 assert.equal(intersectsRun(out[1].maskRuns,txt[0].inkRect),false);
 assert.ok(out[0].maskPixelCount>300);
 assert.ok(out[1].maskPixelCount>300);
 assert.ok(out.every(x=>x.maskPolygon.length>8));
});
test("empty colored image makes no fabricated masks",()=>{
 assert.equal(detect(image(),[],[]).length,0);
});
test("dark text region remains as a bounded text seed, not a huge dark-panel mask",()=>{
 const img=image(200,130);
 const a=detect(img,[],[t(80,50,45,18)])[0];
 assert.equal(a.maskPixelCount,45*18);
 assert.equal(a.sourceShapeId,null);
 assert.equal(a.status,"PROVISIONAL_INSTANCE");
});
test("invalid raster and oversized allocation are rejected",()=>{
 assert.equal(detect({width:9000,height:9000,data:new Uint8Array(4)},[],[]).length,0);
 assert.equal(detect(null,[],[]).length,0);
});
