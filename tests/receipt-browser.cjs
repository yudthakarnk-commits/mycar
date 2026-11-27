const {chromium,webkit}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const mime={'.js':'application/javascript','.wasm':'application/wasm','.gz':'application/gzip','.html':'text/html'};
const html='<html><body><script src="/fuel-receipt.js"></script><script src="/vendor/ocr/tesseract.min.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 const f=path.resolve(root,'.'+p);
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage();
   await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   await page.goto(origin);
   const result=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=1200;c.height=800;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='42px monospace';
    ['SHELL SERVICE STATION','20NOV2026','VRN TEST1234','Odometer 22578','FuelSave 95','33.870ltr@RM3.720/ltr','TOTAL RM126.00'].forEach((line,i)=>ctx.fillText(line,40,65+i*75));
    const root=location.origin+'/vendor/ocr/';
    const worker=await Tesseract.createWorker('eng',1,{workerPath:root+'worker.min.js',corePath:root+'core/tesseract-core-lstm.wasm.js',langPath:root+'lang/',workerBlobURL:false});
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});const {data}=await worker.recognize(c);return {text:data.text,parsed:MYCARReceipt.parse(data.text)};}finally{await worker.terminate();}
   });
   assert.equal(result.parsed.total,126,JSON.stringify(result));assert.equal(result.parsed.odometer,22578,JSON.stringify(result));assert.equal(result.parsed.date,'2026-11-20',JSON.stringify(result));
   console.log(engine.name()+' self-hosted OCR smoke passed');
  }finally{await browser.close();}
 }
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
