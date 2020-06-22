const express = require('express');
const axios = require('axios'); 
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');

// Read properties from our environment file (hidden unless REPL owner)
const apikey = process.env.apikey;
const tdturl = process.env.tdturl;
const rturl = process.env.rturl;
const sessurl = process.env.sessurl;
const dclurl = process.env.dclurl;
const licensekey = process.env.licensekey;
const doclib = process.env.doclib;

// Bring in our JSON config files
const tdtbody = require('./json/tdtbody.json');
const tdtheaders = require('./json/tdtheaders.json');
const rtheaders = require('./json/rtheaders.json');
const rtbody = require('./json/rtbody.json');
const sessbody = require('./json/sessbody.json');
const dclbody = require('./json/dclbody.json');
const immbody = require('./json/immbody.json');

// Update our JSON from .env properties
tdtheaders["x-api-key"] = apikey; 
rtbody.client.licenseKey = licensekey;
rtbody.documentLibraryVersion = doclib;
dclbody.jobTicket.DocumentLibraryVersion.DocumentLibraryVersion = doclib;
dclbody.jobTicket.Prefs.LicenseKeyString = licensekey;
rtbody.documentLibraryVersion = doclib;
immbody.jobTicket.DocumentLibraryVersion.DocumentLibraryVersion = doclib;
immbody.jobTicket.Prefs.LicenseKeyString = licensekey;
// TODO: Move IMM Forwarding Details to .env 

// Configure and Launch the Express Server
app.use(bodyParser.json({limit: '15mb'})); 
app.use(bodyParser.text({ type: 'text/plain' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public')); // load files from public directory
app.listen(process.env.PORT || 3000, function() {
  console.log('Express server listening on port %d in %s mode', this.address().port, app.settings.env);
});

// Primary entry point for REPL
app.get("/", function(req, res) {
  console.log('A - GET hit...');
  res.sendFile('public/index.html'); // no need to specify dir off root
});

app.post("/getdocs", function(req, res) {
  console.log('B - getdocs post hit...');
  let receivedData = JSON.parse(req.body.payload); 
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});

async function getDocs(receivedData) {
  console.log('C - getDocs() hit...');
  // 1 - CALL TDT 
  let base64data = base64encode(JSON.stringify(receivedData)); 
  tdtbody.partnerData = base64data;
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii');
  console.log("1 - TXL received");

  // 2 - CALL RUNTIME PAYMENT CALC
  let base64payload = base64encode(txl); 
  rtbody.transactionData = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  let sessionId = rtResponse.data.session.id;
  console.log("2 - SessionId = " + sessionId);

  // 3 - CALL SESSION TO GET FULL TXL
  sessbody.session.id = sessionId;
  let sessResponse = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let fulltxl = sessResponse.data.transactionData;
  // let fulltxldecoded = base64decode(fulltxl);
  console.log("3 - Full Txl received");

  // 4 - CALL DCL EXECUTE JOB TICKET
  dclbody.jobTicket.DataValuesList[0].content = fulltxl;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  console.log("4 - Encoded PDF returned");

  // 5 - CALL DCL AGAIN TO SEND DOCUMENTS TO IMM
  /*
  immbody.jobTicket.DataValuesList[0].content = fulltxl;
  let immResponse = await axios.post(dclurl, immbody, { headers: rtheaders});
  let forwardingResults = JSON.stringify(immResponse.data.Result.ForwardingResults);
  console.log('Forwarding Results = ' + forwardingResults);
  //let immStatus = forwarding status
  */

  let forwardingResults = 'IMM commented off until TDT has signing meta...';

  let backUrl = '<a href="https://cunexus--sbatester.repl.co">Go Back</a>';
  return('<html><p>Status of IMM is: ' + forwardingResults + '</p><br>' + backUrl + '<br><br><object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + '"' + '></object></html>');
}