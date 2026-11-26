const assert=require('node:assert/strict');
const {parse,assess}=require('../fuel-receipt.js');
const r=parse('SHELL SERVICE STATION\nKM 271 SEREMBAN\n(ARAH UTARA)\n20NOV2026 02:03PM\nVRN VQG8991\nOdometer 22578\nFuelSave 95(Pump 17) RM126.00\n33.870ltr@RM3.720/ltr\nTOTAL RM126.00');
assert.equal(r.date,'2026-11-20');assert.equal(r.odometer,22578);assert.equal(r.liters,33.87);assert.equal(r.price,3.72);assert.equal(r.total,126);assert.equal(r.fuelType,'RON95');assert.equal(r.plate,'VQG8991');assert.equal(r.station,'Shell R&R Seremban (Northbound)');assert.deepEqual(r.warnings,[]);
assert.equal(assess(r,{id:'a',plate:'OTHER'},[]).mismatch,true);
assert.ok(assess(r,{id:'a',plate:r.plate},[{id:'b',vehicleId:'a',date:r.date,odometer:r.odometer,cost:126}]).warnings.some(x=>x.includes('duplicate')));
assert.ok(parse('33.870ltr@RM3.720/ltr\nTOTAL RM12.00').warnings.some(x=>x.includes('differs')));
assert.equal(parse('31FEB2026').date,null);
assert.equal(parse('unreadable').total,null);
console.log('Receipt parser tests passed');

const noisy=parse('SHELL SERVICE STATION,\nKM 271 KAWASAN REHAT SEREMBAN,\n(ARAH UTARA),\n20NOV2026 02:03PM\nVRN vocse991\nOdome ter 22578\nFuelSave 95(Pump 17) RM126 . 00\n33.8701 tr@RM3.720/1tr\nTOTAL RM126.00');
assert.equal(noisy.odometer,22578);assert.equal(noisy.liters,33.87);assert.equal(noisy.price,3.72);assert.equal(noisy.total,126);assert.equal(noisy.plate,'vocse991');
assert.equal(assess(noisy,{id:'a',plate:'VQG8991'},[]).mismatch,true);
assert.ok(assess(r,{id:'a',plate:r.plate},[{id:'earlier',vehicleId:'a',date:'2026-11-19',odometer:23000}]).warnings.some(x=>x.includes('Odometer')));
console.log('Noisy OCR and historical odometer tests passed');

const comma=parse('05SEP2026\nOdometer 17,590\n39, 800Ltr@RM4.570/1tr\nTOTAL RM181,89\nFuelSave 95\nSHELL SERVICE SIATLON');
assert.equal(comma.liters,39.8);assert.equal(comma.price,4.57);assert.equal(comma.total,181.89);assert.equal(comma.odometer,17590);assert.ok(comma.warnings.some(x=>x.includes('formatting')));
assert.equal(parse('OSSEP2026').date,null);
assert.equal(parse('O60CT2026').date,null);
assert.equal(parse('05SEP2026\n06SEP2026').date,null);
assert.equal(parse('TOTAL RM134,03\nTOTAL RM169. 09').total,null);
assert.equal(parse('TOTAL RM169. 09').total,169.09);
assert.equal(parse('Odometer 17,59').odometer,null);
assert.equal(parse('39,800Ltr@RM4.570/ltr').liters,39.8);
assert.equal(parse('33.870ltr@RM3.720/ltr\n34.870ltr@RM3.720/ltr').liters,null);
console.log('V2 formatting, ambiguity and conflict tests passed');

const {merge}=require('../fuel-receipt.js');
assert.equal(merge([r,r]).total,126);
assert.equal(merge([r,{...r,total:127}]).total,null);
assert.equal(merge([r,{...r,plate:'OTHER'}]).plate,null);
assert.equal(merge([r,{...r,liters:null}]).liters,33.87);
assert.ok(merge([r,{...r,liters:null}]).warnings.some(w=>w.includes('one OCR pass')));
assert.equal(merge([r,{...r,total:null,warnings:['Conflicting total values; enter manually.']}]).total,null);
assert.equal(merge([{...r,total:100},{...r,total:100}]).liters,null);
console.log('Multi-pass conflict tests passed');
