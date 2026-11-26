(function(){
'use strict';
let generation=0, url=null, result=null, busy=false, loader=null;
const el=id=>document.getElementById(id);
function reset(){
 generation++;result=null;
 if(url){URL.revokeObjectURL(url);url=null;}
 el('receipt-preview').removeAttribute('src');el('receipt-preview').classList.add('hidden');
 el('receipt-status').classList.add('hidden');el('receipt-status').textContent='';
 el('receipt-review').hidden=true;el('receipt-review').textContent='';
 el('receipt-plate-box').hidden=true;el('receipt-plate-confirm').value='';
 el('receipt-apply').hidden=true;el('receipt-apply').disabled=true;
}
function status(s){el('receipt-status').textContent=s;el('receipt-status').classList.remove('hidden');}
async function enhance(source){
 const image=new Image();image.src=source;await image.decode();
 const scale=Math.min(2,2400/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
 for(let i=0;i<d.length;i+=4){const gray=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];const v=Math.max(0,Math.min(255,(gray-128)*1.35+128));d[i]=d[i+1]=d[i+2]=v;}
 ctx.putImageData(pixels,0,0);return canvas;
}
function normalizedPlate(s){return String(s||'').replace(/[^a-z0-9]/gi,'').toUpperCase();}
function plateChanged(){
 if(!result)return;const c=result.context();if(!c||c.key!==result.key){reset();return;}
 const manual=normalizedPlate(el('receipt-plate-confirm').value);
 el('receipt-apply').disabled=!!result.needsPlate&&(!manual||manual!==normalizedPlate(c.vehicle.plate));
}
function load(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
 script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('OCR unavailable'));
 script.onerror=()=>reject(new Error('OCR download failed'));document.head.appendChild(script);
 }).catch(e=>{loader=null;throw e;});return loader;
}
async function scan(event,context){
 const file=event.target.files?.[0];if(!file)return;reset();
 if(busy){status('Previous scan is finishing. Choose the photo again.');return;}
 if(!file.type.startsWith('image/')||file.size>15*1024*1024){status('Choose an image under 15 MB, or enter values manually.');return;}
 const token=generation;url=URL.createObjectURL(file);el('receipt-preview').src=url;el('receipt-preview').classList.remove('hidden');
 busy=true;let worker;
 try{
 status('Loading local OCR…');const lib=await load();if(token!==generation)return;
 worker=await lib.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',logger:m=>{if(token===generation&&m.status==='recognizing text')status('Reading receipt '+Math.round(m.progress*100)+'%');}});
 if(token!==generation)return;
 let input=file;try{input=await enhance(url);}catch(e){}if(token!==generation)return;
 const {data}=await worker.recognize(input);if(token!==generation)return;
 let r=window.MYCARReceipt.parse(data.text);
 if(input!==file&&(r.warnings.length||!r.plate||normalizedPlate(r.plate)!==normalizedPlate(context()?.vehicle.plate))){
 const original=await worker.recognize(file);if(token!==generation)return;
 const alt=window.MYCARReceipt.parse(original.data.text);
 const score=x=>['date','odometer','liters','price','total','fuelType','station'].filter(k=>x[k]!=null).length-x.warnings.length*2;
 if(score(alt)>score(r))r=alt;
 }
 const c=context();if(!c||c.key!==context.key){status('Form changed. Select receipt again.');return;}
 const check=window.MYCARReceipt.assess(r,c.vehicle,c.records,c.id);
 const fields=[['Date',r.date],['Odometer',r.odometer],['Litres',r.liters],['RM/litre',r.price],['Total RM',r.total],['Plate',r.plate],['Fuel',r.fuelType],['Station',r.station]];
 const review=el('receipt-review');review.textContent='';
 for(const [name,value] of fields){const line=document.createElement('div');line.textContent=name+': '+(value??'Not recognized');review.appendChild(line);}
 for(const warning of check.warnings){const line=document.createElement('div');line.textContent='Warning: '+warning;review.appendChild(line);}
 review.hidden=false;const needsPlate=check.mismatch||!r.plate;result={r,context,key:c.key,needsPlate};el('receipt-plate-box').hidden=!needsPlate;el('receipt-apply').hidden=false;el('receipt-apply').disabled=needsPlate;
 status('Review recognized values against the photo. Nothing has been saved.');
 }catch(e){if(token===generation)status('OCR unavailable or image unreadable. Enter values manually.');}
 finally{if(worker)try{await worker.terminate();}catch(e){}busy=false;}
}
function apply(){
 if(!result)return;const {r,context,key}=result;const c=context();
 if(!c||c.key!==key){reset();return;}
 const confirmed=normalizedPlate(el('receipt-plate-confirm').value);
 if(result.needsPlate&&(!confirmed||confirmed!==normalizedPlate(c.vehicle.plate))){status('Enter the plate printed on the receipt. It must match the selected vehicle.');return;}
 const check=window.MYCARReceipt.assess(result.needsPlate?{...r,plate:confirmed}:r,c.vehicle,c.records,c.id);
 if(!window.confirm('Apply recognized values to the form? Verify all fields before Save. '+check.warnings.join(' ')))return;
 const map={'field-date':r.date,'fuel-odometer':r.odometer,'fuel-liters':r.liters,'fuel-cost':r.total,'fuel-type-name':r.fuelType,'fuel-station':r.station};
 for(const [id,value] of Object.entries(map))if(value!==null&&value!==undefined)el(id).value=value;
 c.refresh();status('Values applied. Check all fields, then Save manually.');el('receipt-apply').disabled=true;result=null;
}
window.MYCARReceiptUI={reset,scan,apply,plateChanged};
})();
