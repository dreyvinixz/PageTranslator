/* Pixel-mask hypotheses for independent speech regions, including touching balloons.
 * Offline / deterministic. This is NOT a trained semantic classifier:
 * two connected white balloons are partitioned by independent text seeds.
 * RLE masks are bounded to the image and never given a fabricated probability.
 */
(function(root) {
"use strict";
const good = r => r && [r.x,r.y,r.width,r.height].every(Number.isFinite) &&
  r.width > 0 && r.height > 0;
const intersection = (a,b) => !good(a)||!good(b) ? 0 :
  Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) *
  Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
function buildInstances(image, shapes, texts, options={}) {
  const {width:w,height:h,data}=image || {};
  if (!Number.isInteger(w)||!Number.isInteger(h)||w<4||h<4||w*h>1500000||
      !data||data.length<w*h*4||!Array.isArray(texts)) return [];
  const sources=(Array.isArray(shapes)?shapes:[]).filter(s=>good(s.rect)).slice(0,30);
  const ink=texts.filter(t=>good(t.inkRect)).slice(0,20);
  const center = r => [r.x+r.width/2,r.y+r.height/2];
  const maxRadius=Math.max(30,Math.min(100,Number(options.maxRadius)||70));
  const belongs=ink.map(t=>{
    const candidates=sources.map((s,j)=>({j,c:intersection(s.rect,t.inkRect)/
      (t.inkRect.width*t.inkRect.height)})).filter(v=>v.c>=.55).sort((a,b)=>b.c-a.c);
    return candidates.length ? candidates[0].j : -1;
  });
  function lit(x,y) {
    const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    return r>=180&&g>=180&&b>=165&&Math.max(r,g,b)-Math.min(r,g,b)<85;
  }
  const result=[];
  ink.forEach((t,i)=>{
    const own=t.inkRect, associated=belongs[i];
    const siblings=ink.map((other,j)=>j!==i&&associated>=0&&belongs[j]===associated?j:-1)
      .filter(j=>j>=0);
    const [cx,cy]=center(own);
    const source=associated>=0?sources[associated]:null;
    const padded={x:Math.max(0,Math.floor(own.x-maxRadius)),
      y:Math.max(0,Math.floor(own.y-maxRadius)),
      x2:Math.min(w,Math.ceil(own.x+own.width+maxRadius)),
      y2:Math.min(h,Math.ceil(own.y+own.height+maxRadius))};
    if(source) {
      padded.x=Math.max(padded.x,Math.floor(source.rect.x));
      padded.y=Math.max(padded.y,Math.floor(source.rect.y));
      padded.x2=Math.min(padded.x2,Math.ceil(source.rect.x+source.rect.width));
      padded.y2=Math.min(padded.y2,Math.ceil(source.rect.y+source.rect.height));
    }
    // Text never vanishes even when the threshold fails on dark ink.
    padded.x=Math.min(padded.x,Math.max(0,Math.floor(own.x)));
    padded.y=Math.min(padded.y,Math.max(0,Math.floor(own.y)));
    padded.x2=Math.max(padded.x2,Math.min(w,Math.ceil(own.x+own.width)));
    padded.y2=Math.max(padded.y2,Math.min(h,Math.ceil(own.y+own.height)));
    // Clip the mask search to a single comic panel; never leak across gutters.
    if(good(t.panelRect)){
      const p=t.panelRect;
      padded.x=Math.max(padded.x,Math.floor(p.x));
      padded.y=Math.max(padded.y,Math.floor(p.y));
      padded.x2=Math.min(padded.x2,Math.ceil(p.x+p.width));
      padded.y2=Math.min(padded.y2,Math.ceil(p.y+p.height));
    }
    const runs=[],occupied=[];
    const extentX=Math.min(maxRadius,Math.max(20,own.width*.9));
    const extentY=Math.min(maxRadius,Math.max(15,own.height*2));
    for(let y=padded.y;y<padded.y2;y++){
      let start=-1;
      for(let x=padded.x;x<=padded.x2;x++){
        const inside=x<padded.x2 && ((x>=own.x&&x<own.x+own.width&&
           y>=own.y&&y<own.y+own.height) ||
          (Math.abs(x-cx)<=own.width/2+extentX && Math.abs(y-cy)<=own.height/2+extentY &&
           lit(x,y)));
        let allowed=inside;
        if(allowed){
          for(const j of siblings){
            const other=ink[j].inkRect,[ox,oy]=center(other);
            const ownDist=(x-cx)**2+(y-cy)**2;
            const otherDist=(x-ox)**2+(y-oy)**2;
            // Prohibit carrying foreign text ink into this instance.
            if(otherDist<ownDist || (x>=other.x&&x<other.x+other.width&&
              y>=other.y&&y<other.y+other.height)) {allowed=false;break;}
          }
        }
        if(allowed&&start<0)start=x;
        if(!allowed&&start>=0){
          if(x-start>=2) {runs.push([y,start,x]);occupied.push([start,y,x,y+1]);}
          start=-1;
        }
      }
    }
    // Conservative safety check on the approximated instance mask.
    const overlapsForeign=ink.some((other,j)=>j!==i && runs.some(([y,x0,x1])=>
      y>=other.inkRect.y && y<other.inkRect.y+other.inkRect.height &&
      x0<other.inkRect.x+other.inkRect.width&&x1>other.inkRect.x));
    const x0=occupied.length?Math.min(...occupied.map(a=>a[0])):own.x;
    const y0=occupied.length?Math.min(...occupied.map(a=>a[1])):own.y;
    const x1=occupied.length?Math.max(...occupied.map(a=>a[2])):own.x+own.width;
    const y1=occupied.length?Math.max(...occupied.map(a=>a[3])):own.y+own.height;
    const bounded={x:x0,y:y0,width:x1-x0,height:y1-y0};
    // Build a compact polygon for overlay from the run envelope, without
    // copying image pixels or storing copyrighted page content.
    const byRow=new Map();
    for(const [y,a,b] of runs){
      const old=byRow.get(y);
      byRow.set(y,old?[Math.min(old[0],a),Math.max(old[1],b)]:[a,b]);
    }
    const sampled=[...byRow.entries()].filter(([y])=>
      (y-Math.floor(y0))%Math.max(1,Math.ceil((y1-y0)/28))===0 || y>=y1-2);
    const polygon=[
      ...sampled.map(([y,[a]])=>[a,y]),
      ...sampled.slice().reverse().map(([y,[,b]])=>[b,y])
    ];
    const duplicate=source&&sources.filter(s=>
      intersection(s.rect,own)/(own.width*own.height)>=.55).length>1;
    result.push({id:"instance-"+(i+1),textGroupId:"text-"+(i+1),
      sourceShapeId:associated<0?null:"shape-"+(associated+1),
      kind:source?.shape==="rectangular"?"caption":"speech-candidate",
      bbox:bounded, maskRuns:runs,maskPolygon:polygon,maskPixelCount:runs.reduce((sum,r)=>sum+r[2]-r[1],0),
      splitFromConnectedShape:siblings.length>0, risk:Boolean(overlapsForeign||duplicate||t.panelRisk),
      status:overlapsForeign||duplicate||t.panelRisk?"REVIEW_REQUIRED":"PROVISIONAL_INSTANCE",
      // Independent mask is a safer OCR crop than one shared white bbox.
      inkRect:own
    });
  });
  return result;
}
root.PageTranslatorInstances={buildInstances};
})(typeof globalThis==="object"?globalThis:self);
