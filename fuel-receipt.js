(function(root){
'use strict';
function parse(text){
 const s=String(text).replace(/\r/g,'').replace(/[ \t]+/g,' ');
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const d=s.match(/\b(\d{1,2})\s*([A-Z]{3})\s*(\d{4})\b/i);
 let date=null;
 if(d){const m=months.indexOf(d[2].toUpperCase())+1;const day=+d[1],year=+d[3];if(m&&day>0&&day<=new Date(Date.UTC(year,m,0)).getUTCDate())date=year+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
 const number=(m,i=1)=>m?Number(m[i].replace(/,/g,'')):null;
 const qty=s.match(/(\d+(?:\.\d{1,3})?)\s*(?:[l1]\s*tr|litres?|L)\s*@\s*RM\s*(\d+(?:\.\d{1,3})?)\s*\/\s*(?:[l1]\s*tr|litres?|L)\b/i);
 const total=number(s.match(/^\s*TOTAL\s+RM\s*([\d,]+\.\d{2})\s*$/im));
 const liters=number(qty),price=number(qty,2);
 const odometer=number(s.match(/^\s*Odo\s*me\s*ter\s+([\d,]+)\s*$/im));
 const plate=s.match(/^\s*VRN\s+([A-Z0-9 -]+)\s*$/im)?.[1]?.trim()||null;
 const fuelType=/FuelSave\s*95|\bRON\s*95\b/i.test(s)?'RON95':/\bRON\s*97\b|V-Power\s*97/i.test(s)?'RON97':/\bDiesel\b/i.test(s)?'Diesel':null;
 const station=/SHELL SERVICE STATION/i.test(s)&&/SEREMBAN/i.test(s)?'Shell R&R Seremban'+(/ARAH UTARA/i.test(s)?' (Northbound)':''):/SHELL SERVICE STATION/i.test(s)?'Shell':null;
 const warnings=[];
 if(!date||!odometer||!liters||!price||total===null||!fuelType)warnings.push('Missing or unclear receipt fields.');
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
