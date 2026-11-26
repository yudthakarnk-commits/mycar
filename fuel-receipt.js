(function(root){
'use strict';
function parse(text){
 const s=String(text).replace(/\r/g,'').replace(/[ \t]+/g,' ');
 const warnings=[];
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 // Accept only complete, labelled or structurally recognizable date tokens.
 // OCR-confused digits are never substituted automatically.
 const dates=[...s.matchAll(/\b(\d{1,2})[ \t]*([A-Z]{3})[ \t]*(\d{4})\b/gi)].map(d=>{
 const m=months.indexOf(d[2].toUpperCase())+1,day=+d[1],year=+d[3];
 return m&&year>=2000&&year<=2099&&day>0&&day<=new Date(Date.UTC(year,m,0)).getUTCDate()?year+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0'):null;
 }).filter(Boolean);
 function unique(values,label){
 const v=[...new Set(values.filter(x=>x!==null))];
 if(v.length>1){warnings.push('Conflicting '+label+' values; enter manually.');return null;}
 return v[0]??null;
 }
 const date=unique(dates,'date');
 // Decimal comma/space are allowed only with the explicit decimal precision for that field.
 // No substitution of letters for digits, no inference from amount / price.
 function decimal(raw,min,max,label){
 const v=raw.trim();
 const m=v.match(/^(\d+)[ \t]*([.,])[ \t]*(\d+)$/);
 if(!m||m[3].length<min||m[3].length>max)return null;
 if(m[2]===','||/[ \t]/.test(v))warnings.push('Review OCR formatting: '+label+' ('+v+').');
 const n=Number(m[1]+'.'+m[3]);return Number.isFinite(n)&&n>0?n:null;
 }
 const qty=[...s.matchAll(/(?:^|\s)(\d+[ \t]*[.,][ \t]*\d{1,3})[ \t]*(?:[l1][ \t]*tr|litres?|L)[ \t]*@[ \t]*RM[ \t]*(\d+[ \t]*[.,][ \t]*\d{1,3})[ \t]*\/[ \t]*(?:[l1][ \t]*tr|litres?|L)\b/gim)];
 const liters=unique(qty.map(m=>decimal(m[1],3,3,'litres')),'litres');
 const price=unique(qty.map(m=>decimal(m[2],2,3,'unit price')),'unit price');
 const totals=[...s.matchAll(/^[ \t]*TOTAL[ \t]+RM[ \t]*(\d+[ \t]*[.,][ \t]*\d{2})[ \t]*$/gim)];
 const total=unique(totals.map(m=>decimal(m[1],2,2,'total')),'total');
 const odometer=unique([...s.matchAll(/^[ \t]*Odo[ \t]*me[ \t]*ter[ \t]+(\d+|\d{1,3}(?:,\d{3})+)[ \t]*$/gim)].map(m=>{const n=Number(m[1].replace(/,/g,''));return Number.isSafeInteger(n)&&n>0?n:null;}),'odometer');
 const plate=unique([...s.matchAll(/^[ \t]*VRN[ \t]+([A-Z0-9 -]+)[ \t]*$/gim)].map(m=>m[1].trim()),'plate');
 const types=[];
 if(/FuelSave[ \t]*95|\bRON[ \t]*95\b/i.test(s))types.push('RON95');
 if(/\bRON[ \t]*97\b|V-Power[ \t]*97/i.test(s))types.push('RON97');
 if(/\bDiesel\b/i.test(s))types.push('Diesel');
 const fuelType=unique(types,'fuel type');
 const shell=/SHELL[ \t]+SERVICE[ \t]+(?:STATION|SIATLON)/i.test(s);
 const station=shell&&/SEREMBAN/i.test(s)?'Shell R&R Seremban'+(/ARAH UTARA/i.test(s)?' (Northbound)':''):shell?'Shell':null;
 if(!date||!odometer||!liters||!price||total===null||!fuelType)warnings.push('Missing or unclear receipt fields; verify manually.');
 if(liters!==null&&price!==null&&total!==null&&Math.abs(liters*price-total)>0.015)warnings.push('Volume × price differs from total.');
 return {date,odometer,liters,price,total,plate,fuelType,station,warnings};
}
function assess(r,vehicle,records,id){
 const warnings=[...r.warnings],norm=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 const mismatch=!!(r.plate&&norm(r.plate)!==norm(vehicle.plate));
 if(mismatch)warnings.push('Receipt plate does not match selected vehicle.');
 if(!r.plate)warnings.push('Receipt plate not recognized.');
 const own=records.filter(x=>x.vehicleId===vehicle.id&&x.id!==id);
 if(r.date&&r.odometer&&r.total!==null&&own.some(x=>x.date===r.date&&Number(x.odometer)===r.odometer&&Math.abs(Number(x.cost)-r.total)<0.01))warnings.push('Possible duplicate fuel record.');
 if(r.date&&r.odometer&&own.some(x=>(x.date<r.date&&Number(x.odometer)>r.odometer)||(x.date>r.date&&Number(x.odometer)<r.odometer)))warnings.push('Odometer conflicts with dated fuel history.');
 return {warnings,mismatch};
}
root.MYCARReceipt={parse,assess};if(typeof module!=='undefined')module.exports=root.MYCARReceipt;
})(typeof window!=='undefined'?window:globalThis);
