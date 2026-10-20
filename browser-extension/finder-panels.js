/* Page/panel-aware geometry. Detect long gutters as separators before speech grouping.
   Conservative geometric fallback: not a semantic learned panel model. */
(function(root){
"use strict";
const valid=r=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
function intersect(a,b){
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
 const right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
const area=r=>r.width*r.height;
function insideRect(inner,outer,tolerance=1){
 return valid(inner)&&valid(outer)&&inner.x>=outer.x-tolerance&&inner.y>=outer.y-tolerance&&
 inner.x+inner.width<=outer.x+outer.width+tolerance&&
 inner.y+inner.height<=outer.y+outer.height+tolerance;
}
function findPanels(image,allowed,opts={}) {
 const {width:w,height:h,data}=image||{};
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<40||h<40||w*h>1500000||
   !data||data.length<w*h*4||!Array.isArray(allowed))return [];
 const minSide=Math.max(45,Number(opts.minSide)||55);
 const maxDepth=Math.min(5,Math.max(1,Number(opts.maxDepth)||4));
 function klass(x,y){
   const k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2];
   const max=Math.max(r,g,b),min=Math.min(r,g,b),avg=(r+g+b)/3;
   return avg<65?"dark":avg>239&&max-min<22?"light":"other";
 }
 function uniformRatio(rect,dir,pos){
   const span=dir==="vertical"?rect.height:rect.width;
   const stride=Math.max(1,Math.floor(span/110));
   let dark=0,light=0,total=0;
   for(let t=2;t<span-2;t+=stride) {
     const x=dir==="vertical"?pos:Math.min(w-1,Math.floor(rect.x+t));
     const y=dir==="vertical"?Math.min(h-1,Math.floor(rect.y+t)):pos;
     const k=klass(x,y);dark+=k==="dark";light+=k==="light";total++;
   }
   return total?Math.max(dark,light)/total:0;
 }
 function bestSplit(rect){
   let winner=null;
   for(const dir of ["vertical","horizontal"]){
     const start=dir==="vertical"?rect.x:rect.y;
     const span=dir==="vertical"?rect.width:rect.height;
     const other=dir==="vertical"?rect.height:rect.width;
     if(span<minSide*2+5||other<minSide)continue;
     const minWidth=dir==="vertical"?Math.max(3,Math.ceil(w*.003)):
       Math.max(3,Math.ceil(h*.003));
     const maxWidth=Math.max(minWidth+1,Math.min(24,Math.floor(span*.055)));
     const begin=Math.ceil(start+minSide),end=Math.floor(start+span-minSide);
     const candidates=[];
     let run=null;
     for(let pos=begin;pos<=end+1;pos++){
       const ratio=pos<=end?uniformRatio(rect,dir,pos):0;
       if(ratio>=.87){
         if(!run)run={start:pos,end:pos+1,sum:ratio};
         else{run.end=pos+1;run.sum+=ratio;}
       }else if(run){
         const thickness=run.end-run.start;
         if(thickness>=minWidth&&thickness<=maxWidth){
           const middle=(run.start+run.end)/2;
           const balance=Math.min(middle-start,start+span-middle)/span;
           if(balance>.10)candidates.push({...run,
             direction:dir,quality:run.sum/thickness,score:run.sum/thickness+.2*balance});
         }
         run=null;
       }
     }
     candidates.sort((a,b)=>b.score-a.score);
     if(candidates[0]&&(!winner||candidates[0].score>winner.score))winner=candidates[0];
   }
   return winner;
 }
 function hasContent(rect){
   let nonUniform=0,n=0;
   for(let y=Math.ceil(rect.y+4);y<rect.y+rect.height-3;y+=Math.max(3,Math.floor(rect.height/15)))
     for(let x=Math.ceil(rect.x+4);x<rect.x+rect.width-3;x+=Math.max(3,Math.floor(rect.width/15))){
       nonUniform+=klass(x,y)==="other";n++;
     }
   return n&&nonUniform/n>.065;
 }
 const output=[];
 function recur(region,depth){
   if(depth<maxDepth){
     const s=bestSplit(region);
     if(s){
       const first=s.direction==="vertical"?
         {x:region.x,y:region.y,width:s.start-region.x,height:region.height}:
         {x:region.x,y:region.y,width:region.width,height:s.start-region.y};
       const second=s.direction==="vertical"?
         {x:s.end,y:region.y,width:region.x+region.width-s.end,height:region.height}:
         {x:region.x,y:s.end,width:region.width,height:region.y+region.height-s.end};
       if(first.width>=minSide&&second.width>=minSide&&
         first.height>=minSide&&second.height>=minSide&&hasContent(first)&&hasContent(second)){
         recur(first,depth+1);recur(second,depth+1);return;
       }
     }
   }
   output.push({rect:region,kind:"panel-candidate",source:"gutter-geometry"});
 }
 for(const raw of allowed.slice(0,12)){
   if(!valid(raw))continue;
   const box=intersect(raw,{x:0,y:0,width:w,height:h});
   if(box&&box.width>=minSide&&box.height>=minSide)recur({
     x:Math.ceil(box.x),y:Math.ceil(box.y),
     width:Math.floor(box.width),height:Math.floor(box.height)
   },0);
 }
 // Avoid overlapping DOM images painting the same physical area twice.
 const unique=[];
 for(const p of output){
   if(unique.some(q=>{const i=intersect(p.rect,q.rect);
     return i&&area(i)/Math.min(area(p.rect),area(q.rect))>.88;}))continue;
   unique.push({...p,id:"panel-"+(unique.length+1)});
 }
 return unique.slice(0,32);
}
function confineTextToPanels(texts,panels,minCoverage=.91) {
 if(!Array.isArray(texts)||!Array.isArray(panels))return [];
 return texts.map(t=>{
   if(!valid(t?.inkRect))return {...t,panelId:null,panelRisk:true};
   const ranked=panels.map(p=>({p,match:intersect(t.inkRect,p.rect)}))
     .map(v=>({...v,cover:v.match?area(v.match)/area(t.inkRect):0}))
     .sort((a,b)=>b.cover-a.cover);
   const best=ranked[0];
   if(!best||best.cover<minCoverage)return {...t,panelId:null,panelRisk:true};
   const crop=valid(t.rect)?intersect(t.rect,best.p.rect):null;
   return {...t,panelId:best.p.id,
     panelRisk:ranked.length>1&&ranked[1].cover>=.15,
     rect:crop||t.rect};
 });
}
root.PageTranslatorPanels={findPanels,confineTextToPanels,intersect,insideRect};
})(typeof globalThis==="object"?globalThis:self);
