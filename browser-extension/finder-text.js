/* OCR-free ink grouping for text-bearing speech regions. This never recognizes words. */
(function(root){
"use strict";
function findTextCandidates(image,allowed,opts={}){
  const {width:w,height:h,data}=image||{};
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||w*h>1500000||
     !data||data.length<w*h*4||!Array.isArray(allowed)||!allowed.length)return [];
  const n=w*h,bright=new Uint8Array(n),dark=new Uint8Array(n);
  for(let i=0;i<n;i++){
    const k=i*4,r=data[k],g=data[k+1],b=data[k+2];
    bright[i]=(r>=185&&g>=185&&b>=180&&Math.max(r,g,b)-Math.min(r,g,b)<=65)?1:0;
    dark[i]=((3*r+6*g+b)/10<145)?1:0;
  }
  const integral=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++){
    let sum=0;
    for(let x=0;x<w;x++){
      sum+=bright[y*w+x];
      integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+sum;
    }
  }
  function light(x,y,x2,y2){
    x=Math.max(0,Math.min(w,x|0));y=Math.max(0,Math.min(h,y|0));
    x2=Math.max(x,Math.min(w,x2|0));y2=Math.max(y,Math.min(h,y2|0));
    const total=(x2-x)*(y2-y);if(!total)return 0;
    const sum=integral[y2*(w+1)+x2]-integral[y*(w+1)+x2]-
      integral[y2*(w+1)+x]+integral[y*(w+1)+x];
    return sum/total;
  }
  const visited=new Uint8Array(n),queue=new Int32Array(n),chars=[];
  for(let seed=0;seed<n;seed++){
    if(visited[seed]||!dark[seed])continue;
    visited[seed]=1;
    let head=0,tail=1;queue[0]=seed;
    let xMin=w,yMin=h,xMax=0,yMax=0;
    while(head<tail){
      const pos=queue[head++],x=pos%w,y=(pos/w)|0;
      if(x<xMin)xMin=x;if(x>xMax)xMax=x;
      if(y<yMin)yMin=y;if(y>yMax)yMax=y;
      const adjacent=[x>0?pos-1:-1,x+1<w?pos+1:-1,y>0?pos-w:-1,y+1<h?pos+w:-1];
      for(const p of adjacent){
        if(p<0||visited[p]||!dark[p])continue;
        visited[p]=1;queue[tail++]=p;
      }
    }
    const cw=xMax-xMin+1,ch=yMax-yMin+1;
    if(cw<2||cw>22||ch<3||ch>15||tail<4||tail>170)continue;
    if(!allowed.some(r=>xMin+cw/2>=r.x&&xMin+cw/2<=r.x+r.width&&
       yMin+ch/2>=r.y&&yMin+ch/2<=r.y+r.height))continue;
    if(light(xMin-3,yMin-3,xMax+4,yMax+4)<0.42)continue;
    chars.push({x:xMin,y:yMin,w:cw,h:ch});
    if(chars.length>500)break;
  }
  const parent=chars.map((_,i)=>i);
  function find(i){
    let j=i;while(parent[j]!==j)j=parent[j];
    while(parent[i]!==i){const z=parent[i];parent[i]=j;i=z;}return j;
  }
  for(let i=0;i<chars.length;i++){
    const a=chars[i];
    for(let j=i+1;j<chars.length;j++){
      const b=chars[j],gap=Math.max(0,Math.max(a.x,b.x)-Math.min(a.x+a.w,b.x+b.w));
      if(gap>17||Math.abs((a.y+a.h/2)-(b.y+b.h/2))>6||
        a.h/b.h<0.5||a.h/b.h>2.5)continue;
      parent[find(i)]=find(j);
    }
  }
  const groups=new Map();
  chars.forEach((c,i)=>{
    const key=find(i);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  });
  const rows=[];
  for(const group of groups.values()){
    if(group.length<3)continue;
    const left=Math.min(...group.map(c=>c.x)),right=Math.max(...group.map(c=>c.x+c.w));
    const top=Math.min(...group.map(c=>c.y)),bottom=Math.max(...group.map(c=>c.y+c.h));
    if(right-left<10)continue;
    rows.push({x:left,y:top,x2:right,y2:bottom,count:group.length});
  }
  rows.sort((a,b)=>a.y-b.y||a.x-b.x);
  const clusters=[];
  for(const row of rows){
    let found=null,best=1e9;
    for(const cluster of clusters){
      const gap=row.y-cluster.y2;
      const overlap=Math.max(0,Math.min(row.x2,cluster.x2)-Math.max(row.x,cluster.x));
      if(gap < -3||gap>12||
          overlap/Math.min(row.x2-row.x,cluster.x2-cluster.x)<0.23)continue;
      if(gap<best){found=cluster;best=gap;}
    }
    if(!found)clusters.push({...row});
    else{
      found.x=Math.min(found.x,row.x);found.x2=Math.max(found.x2,row.x2);
      found.y=Math.min(found.y,row.y);found.y2=Math.max(found.y2,row.y2);
      found.count+=row.count;
    }
  }
  const result=[];
  for(const a of clusters){
    const ww=a.x2-a.x,hh=a.y2-a.y;
    const px=Math.max(8,Math.min(21,Math.round(ww*.2)));
    const py=Math.max(7,Math.min(15,Math.round(hh*.8)));
    const x=Math.max(0,a.x-px),y=Math.max(0,a.y-py);
    const x2=Math.min(w,a.x2+px),y2=Math.min(h,a.y2+py);
    if(light(x,y,x2,y2)<.35)continue;
    result.push({
      kind:"text-region-candidate",shape:"text",
      score:Number(Math.min(.96,.45+Math.min(.43,a.count*.04)).toFixed(2)),
      characters:a.count,rect:{x,y,width:x2-x,height:y2-y}
    });
  }
  return result.sort((a,b)=>b.characters-a.characters)
    .slice(0,Math.min(18,opts.limit||18));
}
root.PageTranslatorTextCandidates={findTextCandidates};
})(typeof globalThis==="object"?globalThis:self);
