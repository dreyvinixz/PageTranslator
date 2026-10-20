import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const root=join(import.meta.dirname,"..");
const ctx={};ctx.globalThis=ctx;
vm.runInNewContext(readFileSync(join(root,"finder-panels.js"),"utf8"),ctx);
const {findPanels,confineTextToPanels,intersect,insideRect}=ctx.PageTranslatorPanels;
function page(width=360,height=240){
 const pixels=new Uint8ClampedArray(width*height*4);
 function paint(x0,y0,x1,y1,r,g,b){
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const k=(y*width+x)*4;
   pixels[k]=r;pixels[k+1]=g;pixels[k+2]=b;pixels[k+3]=255;
  }
 }
 paint(0,0,width,height,146,94,110);
 return {image:{width,height,data:pixels},paint};
}
test("three comic panels separated by continuous dark gutters remain independent",()=>{
 const {image,paint}=page();
 paint(110,0,119,240,14,14,18);
 paint(233,0,243,240,14,14,18);
 // bright speech ovals inside the panels do not obscure gutters
 paint(27,35,83,65,248,247,242);
 paint(155,70,195,95,248,247,242);
 paint(290,20,327,55,248,247,242);
 const panels=JSON.parse(JSON.stringify(findPanels(image,[{x:0,y:0,width:360,height:240}])));
 assert.equal(panels.length,3,JSON.stringify(panels));
 assert.ok(panels[0].rect.x+panels[0].rect.width<=110);
 assert.ok(panels[1].rect.x>=119);
 assert.ok(panels[1].rect.x+panels[1].rect.width<=233);
 assert.ok(panels[2].rect.x>=243);
 const speech=[
  {inkRect:{x:24,y:40,width:50,height:14},rect:{x:15,y:32,width:83,height:33}},
  {inkRect:{x:160,y:72,width:30,height:15},rect:{x:149,y:65,width:62,height:30}},
  {inkRect:{x:292,y:23,width:30,height:15},rect:{x:278,y:17,width:56,height:42}}
 ];
 const candidates=confineTextToPanels(speech,panels);
 assert.deepEqual(candidates.map(c=>c.panelRisk),[false,false,false]);
 assert.equal(new Set(candidates.map(c=>c.panelId)).size,3);
 for(const c of candidates){
  const own=panels.find(p=>p.id===c.panelId);
  assert.ok(insideRect(c.rect,own.rect));
 }
});
test("wide unstructured gradient doesn't fabricate separators",()=>{
 const {image}=page();
 const panels=findPanels(image,[{x:0,y:0,width:360,height:240}]);
 assert.equal(panels.length,1);
});
test("text crossing panel gutter is marked risky",()=>{
 const a={id:"p1",rect:{x:0,y:0,width:100,height:200}},
   b={id:"p2",rect:{x:110,y:0,width:90,height:200}};
 const output=confineTextToPanels([
  {inkRect:{x:90,y:30,width:29,height:15},rect:{x:88,y:27,width:34,height:20}}
 ],[a,b]);
 assert.equal(output[0].panelRisk,true);
 assert.equal(output[0].panelId,null);
 assert.ok(intersect(a.rect,b.rect)===null);
});
test("unsupported raster and huge input are rejected",()=>{
 assert.equal(findPanels({width:9000,height:9000,data:new Uint8Array(2)},[{x:0,y:0,width:10,height:10}]).length,0);
});
