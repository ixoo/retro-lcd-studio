import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 768;
const H = 512;
const outputDirectory = fileURLToPath(new URL('../art/demos/', import.meta.url));

const FONT = Object.fromEntries(Object.entries({
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111', J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00010/00100/01000/11111', 3: '11110/00001/00001/01110/00001/00001/11110',
  4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/10000/11110/00001/00001/11110',
  6: '01110/10000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110', 9: '01110/10001/10001/01111/00001/00001/01110',
  '.': '00000/00000/00000/00000/00000/00110/00110', ':': '00000/00110/00110/00000/00110/00110/00000',
  '-': '00000/00000/00000/11111/00000/00000/00000', '/': '00001/00010/00100/01000/10000/00000/00000',
  '>': '10000/01000/00100/00010/00100/01000/10000', '<': '00001/00010/00100/01000/00100/00010/00001',
  '+': '00000/00100/00100/11111/00100/00100/00000', '=': '00000/11111/00000/11111/00000/00000/00000',
  '*': '00000/10101/01110/11111/01110/10101/00000', '_': '00000/00000/00000/00000/00000/00000/11111',
  '?': '01110/10001/00001/00010/00100/00000/00100', '!': '00100/00100/00100/00100/00100/00000/00100',
  '[': '01110/01000/01000/01000/01000/01000/01110', ']': '01110/00010/00010/00010/00010/00010/01110',
  '(': '00110/01000/10000/10000/10000/01000/00110', ')': '01100/00010/00001/00001/00001/00010/01100',
  ',': '00000/00000/00000/00000/00110/00100/01000', '%': '11001/11010/00100/01000/10110/00110/00000',
}).map(([key, value]) => [key, value.split('/') ]));

function canvas(fill = 0) { return new Uint8Array(W * H).fill(fill); }
function px(c, x, y, color = 1) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) c[y * W + x] = color; }
function fill(c, x, y, w, h, color = 1) { x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) c.fill(color, yy * W + Math.max(0, x), yy * W + Math.min(W, x + w)); }
function rect(c, x, y, w, h, color = 1, t = 1) { fill(c, x, y, w, t, color); fill(c, x, y + h - t, w, t, color); fill(c, x, y, t, h, color); fill(c, x + w - t, y, t, h, color); }
function line(c, x0, y0, x1, y1, color = 1) { x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1); const dx=Math.abs(x1-x0), sx=x0<x1?1:-1, dy=-Math.abs(y1-y0), sy=y0<y1?1:-1; let e=dx+dy; for (;;) { px(c,x0,y0,color); if(x0===x1&&y0===y1) break; const e2=e*2; if(e2>=dy){e+=dy;x0+=sx;} if(e2<=dx){e+=dx;y0+=sy;} } }
function circle(c, cx, cy, r, color = 1, solid = false) { for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){ const d=x*x+y*y; if(solid?d<=r*r:Math.abs(d-r*r)<=r) px(c,cx+x,cy+y,color); } }
function text(c, value, x, y, color = 1, scale = 1) { let cursor=x; for(const raw of value){ const glyph=FONT[raw.toUpperCase()]??FONT['?']; glyph.forEach((row,gy)=>[...row].forEach((bit,gx)=>{if(bit==='1') fill(c,cursor+gx*scale,y+gy*scale,scale,scale,color);})); cursor+=6*scale; } }
function pattern(c, x, y, w, h, color = 1, step = 4, phase = 0) { for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) if((xx+yy*2+phase)%step===0) px(c,xx,yy,color); }
function stripes(c,x,y,w,h,color=1){ for(let yy=y;yy<y+h;yy+=4) fill(c,x,yy,w,1,color); }

function windowFrame(c,x,y,w,h,title,{stripe=false}={}){
  fill(c,x,y,w,h,0); rect(c,x,y,w,h,1,2); fill(c,x,y+24,w,2,1);
  if(stripe){stripes(c,x+8,y+5,w-16,14,1); fill(c,x+w/2-title.length*6-8,y+3,title.length*12+16,18,0);}
  text(c,title,x+(stripe?w/2-title.length*6:28),y+5,1,2);
  rect(c,x+5,y+5,15,15,1,2); line(c,x+8,y+8,x+16,y+16); line(c,x+16,y+8,x+8,y+16);
}
function scrollbar(c,x,y,h){ rect(c,x,y,18,h,1); fill(c,x,y+18,18,2,1); fill(c,x,y+h-20,18,2,1); line(c,x+4,y+12,x+9,y+6); line(c,x+9,y+6,x+14,y+12); line(c,x+4,y+h-12,x+9,y+h-6); line(c,x+9,y+h-6,x+14,y+h-12); pattern(c,x+4,y+23,10,h-48,1,3); }
function folder(c,x,y,s=1){ fill(c,x+3*s,y,11*s,4*s,1); rect(c,x,y+3*s,28*s,18*s,1,2*s); }
function disk(c,x,y,s=1){ rect(c,x,y,24*s,28*s,1,2*s); fill(c,x+5*s,y+4*s,14*s,7*s,1); rect(c,x+5*s,y+16*s,14*s,8*s,1); }
function doc(c,x,y,s=1){ rect(c,x,y,20*s,27*s,1,2*s); for(let i=0;i<4;i++) fill(c,x+4*s,y+(6+i*5)*s,12*s,s,1); }
function trash(c,x,y,s=1){ fill(c,x,y+4*s,26*s,3*s,1); rect(c,x+4*s,y+7*s,18*s,22*s,1,2*s); for(let i=0;i<3;i++) fill(c,x+(8+i*5)*s,y+11*s,s,14*s,1); }

function unixScreen(){
  const c=canvas(0); fill(c,0,0,W,25,1); text(c,'DESK  FILE  VIEW  OPTIONS',14,6,0,2); text(c,'MON MAY 19 10:24 1986',508,6,0,2);
  pattern(c,0,26,W,H-26,1,17,3);
  windowFrame(c,68,38,345,245,'TERMINAL 1');
  ['SUN4% PWD','/USR/HOME/LEE/SRC/ICONEDIT','SUN4% LS -L','TOTAL 46','-RW-R--R--  1 LEE  STAFF  1324 README','-RW-R--R--  1 LEE  STAFF  4210 ICONEDIT.C','-RW-R--R--  1 LEE  STAFF   512 ICONEDIT.H','SUN4% MAKE','CC -C -O ICONEDIT.C','CC -C -O BITMAP.C','CC -O ICONEDIT ICONEDIT.O BITMAP.O','SUN4% INSTALL','SUN4% UNAME -A','SUNOS 4.1.2  SUN4  WORKSTATION','SUN4% _'].forEach((s,i)=>text(c,s,82,73+i*13,1));
  windowFrame(c,425,38,328,215,'MAIL - 4 MESSAGES');
  ['N  FROM       SUBJECT              DATE','1  KEN        RE: ICON EDITOR        MAY 19','2  SYSADMIN   QUARTERLY REPORT       MAY 18','3  ANNE       SUN SUPPORT            MAY 18','*4 MARK       MEETING TUESDAY        MAY 19'].forEach((s,i)=>text(c,s,439,75+i*14,1));
  fill(c,427,150,324,2,1); ['FROM: MARK@AI.MIT.EDU','TO: LEE@SUN4','SUBJECT: MEETING TUESDAY','','PROJECT MEETING IS TUESDAY','AT 2PM IN ROOM 38-205.'].forEach((s,i)=>text(c,s,439,164+i*13,1));
  windowFrame(c,68,296,282,202,'ICON EDITOR'); rect(c,86,337,150,126,1); for(let x=96;x<226;x+=10) line(c,x,337,x,463); for(let y=347;y<463;y+=10) line(c,86,y,236,y); rect(c,116,367,90,66,1,8); line(c,122,375,161,408); line(c,161,408,200,375); rect(c,246,337,84,70,1); rect(c,258,350,58,42,1,5);
  windowFrame(c,365,296,180,202,'SYSTEM LOAD'); text(c,'LOAD AVERAGE',380,335,1); text(c,'1 MIN: 0.39',380,355,1); text(c,'5 MIN: 0.41',380,369,1); rect(c,380,400,148,75,1); const graph=[62,48,55,40,44,32,50,28,45,35,52,31,38,25,43,30]; graph.forEach((v,i)=>{if(i)line(c,388+(i-1)*8,463-graph[i-1],388+i*8,463-v);});
  windowFrame(c,560,296,193,202,'CLOCK'); circle(c,656,402,58); for(let i=0;i<12;i++){const a=i*Math.PI/6; fill(c,653+Math.sin(a)*48,399-Math.cos(a)*48,6,6,1);} line(c,656,402,620,372,1); line(c,656,402,676,455,1); circle(c,656,402,4,1,true); text(c,'10:24:31 AM',596,470,1);
  return c;
}

function gamingScreen(){
  const c=canvas(1); text(c,'SCORE 023450',14,8,0,3); text(c,'ENERGY',250,8,0,3); for(let i=0;i<12;i++) rect(c,370+i*18,9,14,21,0,2); fill(c,370,9,8*18-4,21,0); text(c,'LEVEL 04',610,8,0,3); fill(c,0,43,W,3,0);
  for(let i=0;i<85;i++){const x=(i*83+29)%W,y=55+((i*47)%180); fill(c,x,y,i%7===0?4:2,i%7===0?4:2,0);} circle(c,87,103,45,0); for(let y=75;y<132;y+=7) line(c,52,y,122,y-14,0);
  // Outpost, dish, astronaut, radio tower and rover.
  rect(c,49,193,140,62,0,4); fill(c,66,171,105,22,0); rect(c,83,211,38,44,1,3); rect(c,131,209,35,27,1,3); line(c,106,171,106,147,0); circle(c,106,141,5,0,true);
  line(c,196,186,239,143,0); line(c,239,143,252,197,0); circle(c,224,165,27,0); line(c,224,165,253,136,0); fill(c,212,197,30,8,0);
  circle(c,307,205,14,0); rect(c,292,219,30,42,0,3); fill(c,284,230,46,8,0); line(c,297,261,290,280,0); line(c,316,261,324,280,0); fill(c,327,232,22,5,0);
  for(let x=372;x<=452;x+=20) line(c,x,111,412,254,0); line(c,372,254,452,254,0); line(c,412,111,412,75,0); circle(c,412,68,9,0); for(let y=138;y<247;y+=25) line(c,380,y,444,y,0);
  rect(c,493,223,79,29,0,4); circle(c,510,258,13,0); circle(c,554,258,13,0); rect(c,516,204,31,19,0,3); fill(c,548,212,12,7,0);
  // Terrain and cave.
  const ridge=[[0,270],[48,248],[104,266],[160,252],[218,275],[276,258],[330,274],[385,250],[440,266],[492,242],[540,260],[590,234],[640,257],[700,240],[767,264]]; for(let i=1;i<ridge.length;i++) line(c,...ridge[i-1],...ridge[i],0); for(let x=0;x<W;x++){const i=Math.max(1,ridge.findIndex(p=>p[0]>=x));const a=ridge[i-1],b=ridge[i];const top=Math.round(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])); fill(c,x,top,1,H-top,0);}
  // Sparse, chunky inclusions keep the rock readable without turning it into noise.
  for(let x=22;x<748;x+=47){const y=300+((x*13)%170);circle(c,x,y,3+(x%5),1,true);line(c,x-10,y+12,x-3,y+6,1);line(c,x-3,y+6,x+5,y+12,1);}
  for(let x=12;x<760;x+=73){const y=330+((x*7)%125);rect(c,x,y,10,7,1);px(c,x+3,y+2,0);}
  // Carve two clean underground chambers out of the solid lunar rock.
  fill(c,245,320,270,150,1); circle(c,270,345,28,1,true); circle(c,490,345,28,1,true);
  fill(c,590,286,116,132,1); circle(c,648,286,58,1,true);
  for(let x=8;x<W;x+=28){line(c,x,486,x+8,476,1);line(c,x+8,476,x+16,486,1);}
  // Platforms, ladders, cave mouth, crystals and alien.
  [[0,278,230],[274,293,184],[500,276,268]].forEach(([x,y,w])=>{fill(c,x,y,w,9,0); for(let xx=x+8;xx<x+w;xx+=18)line(c,xx,y+9,xx+8,y+18,0);});
  [[235,281,365],[466,276,420],[650,276,410]].forEach(([x,y,bottom])=>{line(c,x,y,x,bottom,0);line(c,x+18,y,x+18,bottom,0);for(let yy=y+10;yy<bottom;yy+=18)line(c,x,yy,x+18,yy,0);});
  for(let r=72;r>52;r-=8) circle(c,648,286,r,0); text(c,'M-7',624,244,0,2);
  [[331,401],[390,420],[446,393]].forEach(([x,y])=>{line(c,x,y,x-12,y+20,0);line(c,x,y,x+12,y+20,0);line(c,x-12,y+20,x,y+35,0);line(c,x+12,y+20,x,y+35,0);});
  circle(c,555,397,18,1); fill(c,541,410,28,14,1); for(const dx of [-16,-8,8,16])line(c,555+dx,414,555+dx*2,434,1); fill(c,549,390,4,4,0);fill(c,559,390,4,4,0);
  circle(c,420,382,14,0);fill(c,409,392,22,12,0);for(const dx of [-12,-5,5,12])line(c,420+dx,402,420+dx*2,418,0);fill(c,415,377,3,3,1);fill(c,423,377,3,3,1);
  return c;
}

function commodoreScreen(){
  const c=canvas(0); fill(c,0,0,W,24,1); text(c,'WORKBENCH 1.3   512K CHIP RAM   1276K FAST RAM',10,5,0,2); text(c,'10:24:36',650,5,0,2); pattern(c,0,25,W,H-25,1,4);
  windowFrame(c,32,38,390,220,'WORKBENCH'); scrollbar(c,400,65,177);
  const icons=[['SHELL',65,84],['PREFS',160,84],['UTILITIES',255,84],['PAINT',350,84],['CLOCK',65,170],['CALC',160,170],['DISK COPY',255,170],['DEMOS',350,170]];
  icons.forEach(([label,x,y],i)=>{fill(c,x-8,y-8,66,58,0); if(i===0){rect(c,x,y,42,34,1,2);text(c,'>_',x+8,y+10,1);} else if(i===4){circle(c,x+21,y+17,19);line(c,x+21,y+17,x+21,y+3);line(c,x+21,y+17,x+34,y+22);} else if(i===1){rect(c,x,y,42,34,1,2);for(let xx=x+8;xx<x+38;xx+=10){line(c,xx,y+5,xx,y+29);fill(c,xx-2,y+10+(xx%3)*5,5,5,1);}} else if(i===3){circle(c,x+17,y+17,17);line(c,x+23,y+21,x+44,y-5,1);} else folder(c,x,y,1.4); text(c,label,x-5,y+44,1);});
  windowFrame(c,20,280,300,210,'SHELL 1'); fill(c,22,306,296,188,0); ['1.SYS:> DIR WORKBENCH','SHELL       PRG     6,464','PREFS       DIR       ---','UTILITIES   DIR       ---','PAINT       PRG     8,192','CLOCK       PRG     6,176','CALCULATOR  PRG     4,096','DISK COPY   PRG    12,288','','1,297,152 BYTES FREE','','1.SYS:> COPY WORK:PAINT','1.SYS:> _'].forEach((s,i)=>text(c,s,34,319+i*13,1));
  windowFrame(c,338,265,333,225,'UTILITIES'); scrollbar(c,648,292,181); [['DISK INFO',365,315],['SYSTEM',465,315],['EDIT',565,315],['BACKUP',365,405],['MULTIVIEW',465,405],['MEM INFO',565,405]].forEach(([label,x,y],i)=>{fill(c,x-10,y-8,78,72,0); if(i%3===0)disk(c,x,y,1.5); else if(i%3===1){rect(c,x,y,50,38,1,2);line(c,x+5,y+26,x+15,y+14);line(c,x+15,y+14,x+28,y+29);line(c,x+28,y+29,x+44,y+9);} else {folder(c,x,y,1.6);} text(c,label,x-4,y+52,1);});
  for(const [label,x,y] of [['WORK',690,54],['EXTRAS',690,150]]){fill(c,x-12,y-8,70,82,0);disk(c,x,y,2);text(c,label,x-2,y+63,1,2);} fill(c,672,272,96,70,0); rect(c,700,280,48,34,1,3); for(let i=0;i<8;i++)line(c,700+i*6,280,688+i*7,266); text(c,'RAM DISK',672,322,1,2); fill(c,681,397,72,94,0);trash(c,691,404,2);text(c,'TRASH',694,470,1,2);
  return c;
}

function appleScreen(){
  const c=canvas(0); fill(c,0,0,W,26,1); // original geometric system mark
  fill(c,12,7,14,12,0); line(c,12,13,19,4,0); line(c,19,4,28,13,0); line(c,28,13,19,22,0); line(c,19,22,12,13,0);
  text(c,'DESK  FILE  EDIT  VIEW  SPECIAL',42,6,0,2); text(c,'10:24 AM',660,6,0,2);
  windowFrame(c,102,54,338,190,'SYSTEM DISK',{stripe:true}); text(c,'6 ITEMS       231K IN DISK      231K AVAILABLE',114,82,1); fill(c,104,102,334,2,1); scrollbar(c,420,105,125);
  [['EMPTY FOLDER',135,126,'folder'],['FONT STYLE',245,126,'doc'],['DISK COPY',350,126,'disk'],['NOTE PAD',135,190,'doc'],['SCRAPBOOK',245,190,'doc'],['TIMEKEEPER',350,190,'clock']].forEach(([label,x,y,kind])=>{if(kind==='folder')folder(c,x,y,1.5);else if(kind==='disk')disk(c,x,y,1.5);else if(kind==='clock'){circle(c,x+20,y+20,20);line(c,x+20,y+20,x+20,y+5);line(c,x+20,y+20,x+33,y+26);}else doc(c,x,y,1.4);text(c,label,x-5,y+45,1);});
  windowFrame(c,455,66,296,210,'WORK DISK',{stripe:true}); text(c,'5 ITEMS      127K IN DISK',468,94,1); fill(c,457,114,292,2,1); scrollbar(c,731,117,143); [['LETTERS',485,142],['PROJECTS',585,142],['DATA',685,142]].forEach(([label,x,y])=>{folder(c,x,y,1.5);text(c,label,x-5,y+44,1);}); doc(c,515,210,1.5);text(c,'SALES GRAPH',485,256,1); rect(c,610,210,50,41,1,2);for(let xx=620;xx<657;xx+=10)line(c,xx,210,xx,251);for(let yy=220;yy<251;yy+=10)line(c,610,yy,660,yy);text(c,'BUDGET',611,256,1);
  windowFrame(c,100,262,345,235,'UNTITLED 1 - PAINT',{stripe:true}); rect(c,110,294,63,168,1,2); const tools=[[122,308],[151,308],[122,340],[151,340],[122,372],[151,372],[122,404],[151,404]];tools.forEach(([x,y],i)=>{rect(c,x,y,20,20,1);if(i%2)circle(c,x+10,y+10,6);else line(c,x+3,y+17,x+17,y+3);});rect(c,185,294,245,168,1); line(c,190,420,220,387);line(c,220,387,248,412);line(c,248,412,276,375);line(c,276,375,320,422); for(let x=190;x<426;x+=18){line(c,x,448,x+8,424);line(c,x+8,424,x+16,448);} rect(c,260,393,58,42,1,3);line(c,255,393,289,368);line(c,289,368,323,393);circle(c,353,405,34);pattern(c,324,372,62,68,1,5);
  windowFrame(c,500,310,165,180,'CALC',{stripe:true}); rect(c,516,342,132,28,1,2);text(c,'0.',615,348,1,2);for(let row=0;row<4;row++)for(let col=0;col<5;col++){rect(c,516+col*27,380+row*25,23,21,1);text(c,String((row*5+col)%10),523+col*27,385+row*25,1);}
  fill(c,18,45,72,95,0);disk(c,34,55,2);text(c,'SYSTEM',22,118,1,2);fill(c,18,150,72,95,0);disk(c,34,160,2);text(c,'WORK',34,223,1,2);fill(c,688,382,65,112,0);trash(c,696,390,2);text(c,'DISCARD',687,460,1,2);
  return c;
}

function toXpm(name, pixels){
  const rows=[]; for(let y=0;y<H;y++){let row='';for(let x=0;x<W;x++)row+=pixels[y*W+x]?'.':' ';rows.push(JSON.stringify(row));}
  const identifier=name.replaceAll('-','_');
  return ['/* XPM - hand-composed 1-bit LCD artwork */',`static const char *${identifier}[] = {`,JSON.stringify(`${W} ${H} 2 1`)+',',JSON.stringify('  c #FFFFFF')+',',JSON.stringify('. c #000000')+',',...rows.map((row,i)=>row+(i===rows.length-1?'':',')),'};',''].join('\n');
}

mkdirSync(outputDirectory,{recursive:true});
for(const [name,draw] of [['unix-workstation',unixScreen],['retro-gaming',gamingScreen],['commodore-desktop',commodoreScreen],['apple-desktop',appleScreen]]){
  writeFileSync(`${outputDirectory}${name}.xpm`,toXpm(name,draw()));
  console.log(`Designed ${name}.xpm`);
}
