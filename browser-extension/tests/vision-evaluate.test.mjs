import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {join} from "node:path";
const root=join(import.meta.dirname,"..");
function fixture(w=360,h=240){
 const bytes=Buffer.alloc(w*h*4);
 function fill(x0,y0,x1,y1,r,g,b){
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
     const i=(y*w+x)*4;
     bytes[i]=r;bytes[i+1]=g;bytes[i+2]=b;bytes[i+3]=255;
   }
 }
 fill(0,0,w,h,146,94,110);
 fill(110,0,119,h,14,14,18);
 fill(233,0,243,h,14,14,18);
 fill(27,35,83,65,248,247,242);
 fill(155,70,195,95,248,247,242);
 fill(290,20,327,55,248,247,242);
 return bytes;
}
test("CLI evaluator runs exact JS engine and detects 3 separated panels from raw pixels",()=>{
 const w=360,h=240;
 const stdout=execFileSync(process.execPath,[join(root,"scripts/vision-evaluate.mjs"),String(w),String(h)],{
  input:fixture(w,h),timeout:20000,encoding:"utf8"
 });
 const result=JSON.parse(stdout);
 assert.equal(result.width,w);
 assert.equal(result.height,h);
 assert.equal(result.panels.length,3,JSON.stringify(result.panels));
 assert.equal(result.bboxOutsidePanel,0);
 assert.ok(Number.isFinite(result.elapsedMs));
 assert.ok(result.textCandidates>=0);
});
