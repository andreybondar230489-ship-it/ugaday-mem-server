'use strict';
// HTTPS is terminated by Render. This process only handles HTTP within Render.
const express = require('express');
const http = require('http');
const {WebSocketServer, WebSocket} = require('ws');
const crypto = require('crypto');
const app = express();
app.disable('x-powered-by');
app.get('/health', (_req,res)=>res.json({ok:true,service:'ugaday-mem-relay'}));
const server = http.createServer(app);
const wss = new WebSocketServer({noServer:true, maxPayload: 12*1024*1024});
const hosts = new Map();
const waiting = new Map();
const MAX_PAYLOAD = 8*1024*1024;
const secret = process.env.RELAY_SECRET;
if (!secret || secret.length < 32) {
  console.error('RELAY_SECRET must be set (at least 32 characters)');
  process.exit(1);
}
const uniform = (a,b) => {
  const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
};
server.on('upgrade',(req,socket,head)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!=='/host') {socket.destroy();return;}
    if(!uniform(url.searchParams.get('secret')||'',secret)) {socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  }catch(_){socket.destroy();}
});
wss.on('connection',(ws)=>{
  const session=crypto.randomBytes(18).toString('hex');
  hosts.set(session,ws);
  ws.send(JSON.stringify({type:'session',session,playerBase:'/play/'+session+'/'}));
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch(_){return;}
    if(msg.type!=='response'||typeof msg.id!=='string')return;
    const entry=waiting.get(msg.id);
    if(!entry||entry.session!==session)return;
    waiting.delete(msg.id);clearTimeout(entry.timer);
    const status=Number(msg.status);
    const body=typeof msg.body==='string'?msg.body:'';
    if(body.length>MAX_PAYLOAD*1.5){entry.res.status(502).send('Invalid response');return;}
    const buf=Buffer.from(body,'base64');
    if(buf.length>MAX_PAYLOAD){entry.res.status(502).send('Response too large');return;}
    entry.res.status(Number.isInteger(status)&&status>=200&&status<=599?status:200);
    const mime=typeof msg.contentType==='string'&&/^[a-z\d.+\-\/;= ]{1,120}$/i.test(msg.contentType)?msg.contentType:'application/octet-stream';
    entry.res.set('Content-Type',mime).set('Cache-Control','no-store').send(buf);
  });
  const cleanup=()=>{
    hosts.delete(session);
    for(const [id,entry] of waiting){if(entry.session===session){waiting.delete(id);clearTimeout(entry.timer);entry.res.status(502).send('Host disconnected');}}
  };
  ws.on('close',cleanup);ws.on('error',cleanup);
});
app.use('/play/:session',express.raw({type:'*/*',limit:'8mb'}),(req,res)=>{
  const session=req.params.session;
  const ws=hosts.get(session);
  if(!ws||ws.readyState!==WebSocket.OPEN)return res.status(503).send('Host offline');
  const id=crypto.randomUUID();
  const timer=setTimeout(()=>{waiting.delete(id);if(!res.headersSent)res.status(504).send('Host timeout');},30000);
  waiting.set(id,{session,res,timer});
  const forwardPath=req.originalUrl.slice(('/play/'+session).length)||'/';
  const b=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  ws.send(JSON.stringify({type:'request',id,method:req.method,path:forwardPath,contentType:req.get('content-type')||'',body:b.toString('base64')}),err=>{
    if(err&&waiting.has(id)){waiting.delete(id);clearTimeout(timer);res.status(502).send('Host unavailable');}
  });
});
app.use((_req,res)=>res.status(404).send('Not found'));
const port=Number(process.env.PORT||10000);
server.listen(port,'0.0.0.0',()=>console.log('Ugaday Mem relay on port',port));
