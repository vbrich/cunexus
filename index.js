require('console-stamp')(console, '[HH:MM:ss.l]');
const express = require('express');
const axios = require('axios'); 
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');

// Read our .env properties (hidden unless you are REPL owner)
const apikey = process.env.apikey;
const tdturl = process.env.tdturl;
const rturl = process.env.rturl;
const rtlendurl =process.env.rtlendurl;
const sessurl = process.env.sessurl;
const clearurl = process.env.clearurl;
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
const clearbody = require('./json/clearbody.json');

// Update our JSON files from .env properties
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

// Launch our own index.html from the GET
app.get("/", function(req, res) {  
  res.sendFile('public/index.html'); // no need to specify dir off root
});

// Handle a /getdocs POST
app.post("/getdocs", function(req, res) {
  console.log('A - getdocs post hit...');
  let receivedData = JSON.parse(req.body.payload); 
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});

// Asynchronous function to handle e2e workflow
async function getDocs(receivedData) {
  console.log('B - getDocs() hit...');
  // 1 - CALL TDT 
  let base64data = base64encode(JSON.stringify(receivedData)); 
  tdtbody.partnerData = base64data;
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii');
  console.log("1 - TXL received");

  // 2 - CALL RUNTIME PAYMENT CALC
  let base64payload = base64encode(txl); 
  rtbody.transactionData[0] = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  let sessionId = rtResponse.data.session.id;
  console.log("2 - Runtime PaymentCalc SessionId = " + sessionId);

  // 3 - CALL SESSION TO GET DELTA TXL
  sessbody.session.id = sessionId;
  sessbody.fullTransactionData = 'false';
  let sessResponse = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let deltatxl = sessResponse.data.transactionData;
  // console.log('session body = ' + JSON.stringify(sessbody));
  console.log("3 - Delta Txl received from PaymentCalc");
  
  // 4 - CALL RUNTIME LENDING   
  rtbody.transactionData[0] = ''; 
  rtbody.transactionData[0] = deltatxl;
  rtbody.transactionData[1] = base64payload; // received earlier (original payload)
  let rtlendResponse = await axios.post(rtlendurl, rtbody, { headers: rtheaders});
  let lendsessionId = rtlendResponse.data.session.id;
  console.log("4 - Runtime Lending SessionId = " + lendsessionId);

  // 5 - CALL SESSION TO GET FULL TXL
  sessbody.session.id = lendsessionId;
  sessbody.fullTransactionData = 'true';
  let sessResponseLend = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let fulltxl = sessResponseLend.data.transactionData;
  // console.log('session body = ' + JSON.stringify(sessbody));
  console.log("5 - Full Txl received from Lending");

  // 6 - CALL DCL EXECUTE JOB TICKET
  dclbody.jobTicket.DataValuesList[0].content = fulltxl;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  console.log("6 - Encoded PDF returned");

  // 7 - CALL DCL AGAIN TO SEND DOCUMENTS TO IMM
  /*
  immbody.jobTicket.DataValuesList[0].content = fulltxl;
  let immResponse = await axios.post(dclurl, immbody, { headers: rtheaders});
  let forwardingResults = JSON.stringify(immResponse.data.Result.ForwardingResults);
  console.log('Forwarding Results = ' + forwardingResults);
  //let immStatus = forwarding status
  */
  
  // 8 - ClearSessions 
  // TODO: Send async (even though it is .2 seconds on average)
  clearbody.session.id = sessionId;  
  let clearPymtCalc = await axios.post(clearurl, clearbody, { headers: rtheaders});
  // console.log('Clear PaymentCalc = ' + JSON.stringify(clearPymtCalc.data));
  clearbody.session.id = lendsessionId;
  let clearLending = await axios.post(clearurl, clearbody, { headers: rtheaders});
  // console.log('Clear Lending = ' + JSON.stringify(clearLending.data));
  console.log('8 - Cleared our Runtime Sessions...');

  let forwardingResults = 'IMM commented off until TDT has signing meta...';

  let backUrl = '<a href="https://cunexus--sbatester.repl.co">Go Back</a>';
  return('<html><p>Status of IMM is: ' + forwardingResults + '</p><br>' + backUrl + '<br><br><object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + '"' + '></object></html>');
}