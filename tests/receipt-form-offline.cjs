const {chromium,webkit}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const mime={'.js':'application/javascript','.wasm':'application/wasm','.gz':'application/gzip','.html':'text/html'};
const fixture= '<!doctype html><input id="receipt-file-input" type="file"><img id="receipt-preview"><div id="receipt-status"></div><div id="receipt-review"></div><div id="receipt-plate-box"><input id="receipt-plate-confirm"></div><button id="receipt-apply">Apply</button><input id="field-date" type="date" value="2026-11-27"><input id="fuel-odometer" value="22070"><input id="fuel-liters"><input id="fuel-cost"><select id="fuel-type-name"><option>RON95</option><option>RON97</option></select><input id="fuel-station"><script src="/fuel-receipt.js?v=8"></script><script src="/fuel-receipt-ui.js?v=9"></script>';
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/qa-fixture.html'){res.setHeader('Content-Type','text/html');return res.end(fixture);}
 const f=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
const expected={date:'2026-11-20',odometer:'22578',liters:'33.87',cost:'126',fuelType:'RON95'};
const text='SHELL SERVICE STATION\n20NOV2026\nVRN TEST1234\nOdometer 22578\nFuelSave 95\n33.870ltr@RM3.720/ltr\nTOTAL RM126.00';
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
   const context=await browser.newContext();
   const page=await context.newPage();
   page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log(engine.name()+' browser '+m.type()+': '+m.text());});
   page.on('requestfailed',r=>console.log(engine.name()+' failed request: '+r.url()+' '+JSON.stringify(r.failure())));
   await page.goto(origin+'/qa-fixture.html');
   await page.evaluate(async()=>{
    await navigator.serviceWorker.register('/service-worker.js');
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
   });
   await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=1200;c.height=800;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='42px monospace';
    ['SHELL SERVICE STATION','20NOV2026','VRN TEST1234','Odometer 22578','FuelSave 95','33.870ltr@RM3.720/ltr','TOTAL RM126.00'].forEach((line,i)=>ctx.fillText(line,40,65+i*75));
    window.qaFile=new File([await new Promise(resolve=>c.toBlob(resolve,'image/png'))],'synthetic.png',{type:'image/png'});
    window.qaContext=()=>({key:'vehicle|',vehicle:{id:'vehicle',plate:'TEST1234'},records:[],id:'',refresh:()=>{window.qaRefresh=(window.qaRefresh||0)+1;}});
    window.qaContext.key='vehicle|';window.confirm=()=>true;
   });
   // Warm the real same-origin runtime through the actual service worker and UI.
   await page.evaluate(()=>MYCARReceiptUI.scan({target:{files:[qaFile]}},qaContext));
   assert.match(await page.locator('#receipt-status').textContent(),/Nothing has been saved/);
   assert.equal(await page.locator('#field-date').inputValue(),'2026-11-27');
   // Force browser offline, then scan again with real OCR.
   const cached=await page.evaluate(async()=>{
    const keys=await caches.keys();const urls=[];
    for(const key of keys){if(key.startsWith('mycar-rc:'))for(const req of await (await caches.open(key)).keys())urls.push(new URL(req.url).pathname);}
    return urls;
   });
   for(const name of ['tesseract.min.js','worker.min.js','core/tesseract-core-lstm.wasm.js','core/tesseract-core-lstm.wasm','core/tesseract-core-simd-lstm.wasm.js','core/tesseract-core-simd-lstm.wasm','lang/eng.traineddata.gz'])assert.ok(cached.includes('/vendor/ocr/'+name),'Missing cached asset '+name);
   await context.setOffline(true);
   await page.evaluate(()=>MYCARReceiptUI.scan({target:{files:[qaFile]}},qaContext));
   assert.match(await page.locator('#receipt-status').textContent(),/Nothing has been saved/);
   console.log(engine.name()+' warm-cache offline OCR passed');
   await context.setOffline(false);
   // Deterministic OCR fixtures exercise real UI independently of recognition variability.
   await page.evaluate(async(text)=>{
    window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text}}),terminate:async()=>{}})};
    await MYCARReceiptUI.scan({target:{files:[qaFile]}},qaContext);MYCARReceiptUI.apply();
   },text);
   const vals=await page.evaluate(()=>({date:document.getElementById('field-date').value,odometer:document.getElementById('fuel-odometer').value,liters:document.getElementById('fuel-liters').value,cost:document.getElementById('fuel-cost').value,fuelType:document.getElementById('fuel-type-name').value}));
   assert.deepEqual(vals,expected);
   assert.equal(await page.evaluate(()=>qaRefresh),1);
   await page.evaluate(async(text)=>{
    window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text}}),terminate:async()=>{}})};
    await MYCARReceiptUI.scan({target:{files:[qaFile]}},qaContext);
   },text.replace('TEST1234','OTHER999').replace('TOTAL RM126.00',''));
   assert.equal(await page.locator('#receipt-apply').isDisabled(),true);
   await page.evaluate(()=>{document.getElementById('receipt-plate-confirm').value='OTHER999';MYCARReceiptUI.plateChanged();});
   assert.equal(await page.locator('#receipt-apply').isDisabled(),true);
   await page.evaluate(()=>{document.getElementById('receipt-plate-confirm').value='TEST1234';MYCARReceiptUI.plateChanged();MYCARReceiptUI.apply();});
   assert.equal(await page.locator('#fuel-cost').inputValue(),'');
   assert.equal(await page.evaluate(()=>MYCARReceipt.validateFuel({date:'2026-11-20',odometer:'22578',liters:'33.87',cost:document.getElementById('fuel-cost').value,fuelType:'RON95'})),false);
   await page.evaluate(()=>MYCARReceiptUI.reset());
   assert.equal(await page.locator('#receipt-apply').isDisabled(),true);
   console.log(engine.name()+' form fixture, plate gate, missing cost and reset passed');
  }finally{await browser.close();}
 }
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
