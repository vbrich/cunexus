require('console-stamp')(console, '[HH:MM:ss.l]');
const fs = require('fs'); // comes part of nodejs
const express = require('express');
const axios = require('axios'); 
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');
var util = require('util')

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

let ispayloadjson = true;
var now = new Date().getUTCMilliseconds();

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
  purgeLogs();
  let receivedData;
  if (isJson(req.body.payload))
    receivedData = JSON.parse(req.body.payload);
  else {
    receivedData = req.body.payload;
    ispayloadjson = false;
  }
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});

// Asynchronous function to handle e2e workflow
async function getDocs(receivedData) {
  console.log('B - getDocs() hit...');
  
  // 1 - CALL TDT 
  let base64data;
  if (ispayloadjson) {
    receivedData = JSON.stringify(receivedData);
    base64data = base64encode(receivedData); 
  } else {
    console.log('C - getDocs() found non-JSON payload...');
    base64data = base64encode(receivedData);
    tdtbody.translatorCode = 'txl';
    tdtbody.mappingData.data = 'csi_empty.json';
  }
  writelog('logs/' + now + '_1_tdtinput', receivedData);
  tdtbody.partnerData = base64data;
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii');
  console.log("1 - TXL received");
  writelog('logs/' + now + '_1_tdtoutput', txl);

  // 2 - CALL RUNTIME PAYMENT CALC
  let base64payload = base64encode(txl); 
  rtbody.transactionData[0] = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  //console.log(rtResponse);
  let sessionId = rtResponse.data.session.id;
  console.log("2 - Runtime PaymentCalc SessionId = " + sessionId);
  writelog('logs/' + now + '_2_calcsession', rtResponse.data.url);

  // 3 - CALL SESSION TO GET DELTA TXL
  sessbody.session.id = sessionId;
  sessbody.fullTransactionData = 'false';
  let sessResponse = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let deltatxl = sessResponse.data.transactionData;
  // console.log('session body = ' + JSON.stringify(sessbody));
  console.log("3 - Delta Txl received from PaymentCalc");
  writelog('logs/' + now + '_3_deltatxl', deltatxl);  

  // 4 - CALL RUNTIME LENDING   
  rtbody.transactionData[0] = ''; 
  rtbody.transactionData[0] = deltatxl;
  rtbody.transactionData[1] = base64payload; // received earlier (original payload)
  let rtlendResponse = await axios.post(rtlendurl, rtbody, { headers: rtheaders});
  let lendsessionId = rtlendResponse.data.session.id;
  console.log("4 - Runtime Lending SessionId = " + lendsessionId);
  writelog('logs/' + now + '_4_lendingsession', rtlendResponse.data.url);

  // 5 - CALL SESSION TO GET FULL TXL
  sessbody.session.id = lendsessionId;
  sessbody.fullTransactionData = 'true';
  let sessResponseLend = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let fulltxl = sessResponseLend.data.transactionData;
  // console.log('session body = ' + JSON.stringify(sessbody));
  console.log("5 - Full Txl received from Lending");
  writelog('logs/' + now + '_5_fulltxldecoded', base64decode(fulltxl));

  // 6 - CALL DCL EXECUTE JOB TICKET
  dclbody.jobTicket.DataValuesList[0].content = fulltxl;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  writelog('logs/' + now + '_6_dclresponse', util.inspect(dclResponse)); // replace circular links since JSON.stringify had issues
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  console.log("6 - Encoded PDF returned");
  writelog('logs/' + now + '_6_pdf', encodedPdf);

  // 7 - CALL DCL AGAIN TO SEND DOCUMENTS TO IMM
  /*
  immbody.jobTicket.DataValuesList[0].content = fulltxl;
  let immResponse = await axios.post(dclurl, immbody, { headers: rtheaders});
  let forwardingResults = JSON.stringify(immResponse.data.Result.ForwardingResults);
  console.log('Forwarding Results = ' + forwardingResults);
  */

  // 8 - ClearSessions 
  clearbody.session.id = sessionId;  
  let clearPymtCalc = await axios.post(clearurl, clearbody, { headers: rtheaders});
  // console.log('Clear PaymentCalc = ' + JSON.stringify(clearPymtCalc.data));
  clearbody.session.id = lendsessionId;
  let clearLending = await axios.post(clearurl, clearbody, { headers: rtheaders});
  // console.log('Clear Lending = ' + JSON.stringify(clearLending.data));
  console.log('8 - Cleared our Runtime Sessions...');

  let backUrl = '<a href="https://cunexus--sbatester.repl.co">Go Back</a>';

  return('<html>' + backUrl + '<br><br><object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + '"' + '></object></html>');
}

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function writelog(logpath, data) {
  fs.writeFile(logpath, data, function (error) {
    if (error) {
      console.error(error);
    }
  });
}

function purgeLogs() {
  const dir = fs.opendirSync('logs')
  let logfile;
  while ((logfile = dir.readSync()) !== null) {
    let logpath = 'logs/' + logfile.name;
    fs.unlink(logpath, function(err) {
      if (err) {
        throw err
      } else {
        console.log("Successfully deleted " + logpath);
      }
    });
    }
  dir.closeSync()
}