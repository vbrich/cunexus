const express = require('express');
const axios = require('axios') 
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');

const apikey = 'rfkpBK4J7V9vJxZCq6Y9R4MRjlZ1NpT25wa8urCd';
const tdturl = 'https://pdt.test.compliancesystems.cloud/api/Translate';
var tdtbody = {"translatorCode":"json","partnerData":"","mappingData":{"location":"1","data":"cunexus_leadsapi_v1.json"}};
const tdtheaders = {'Content-Type': 'application/json','x-api-key': apikey}
const rturl = 'https://runtime.test.compliancesystems.cloud/2.0/api/StartSession/PaymentCalculation';
const rtheaders = {'Content-Type': 'application/json'}
var rtbody = {"documentLibraryVersion": "2020.130.1","client": {"licenseKey":"030qmnHcMieNjHr1vEQbUZtUi4cCg1SVpbAmnwiM3X0bjDbxapbPJYaikFjOn/lo6AhLLlfH2g8+992tRnLZfXW77sIR/TKhMvJgROcWPOaQ+rYhQHL5M9qt+GEa9rW0G0g83+HiwKOZEUKigIwFhKA+mPYZ2o/2Cd+CHctsQ77u8xRrcg86XDxMFtSsVAW/YDMUa3IPOlw8TBbUrFQFv2AyYEs2Nx4BY0IARlRqnUGOS6Y9Y7VwJgafC7Egy4eWdQ7idwaAjiTjBM7q+xzp6jRA=="},"configuration":{"id":"DefaultConfigID"},"notificationUrl": "","redirectUrl": "","transactionData":""}
const sessurl = 'https://runtime.test.compliancesystems.cloud/2.0/api/session';
var sessbody = {"session": {"id": ""},"fullTransactionData": "true"}
const dclurl = 'https://dcl.test.compliancesystems.cloud/2.0/api/TransactionService/ExecuteJobTicket';
var dclbody = {
    "jobId": "",
    "jobTicket": {
        "CombinedOutput": true,
        "DocumentLibraryVersion": {
            "DocumentLibraryVersion": "2020.130.1"
        },
        "DataValuesList": [
					{
						"ContentType": 2,
						"Content": "",
            "Encoding": "base64",
						"Type": "xml"
					}],
        "DocList": [{
                "CrossReference": null,
                "FxlList": [{
                        "ContentType": 5,
                        "Content": "Lending.fxl"
                    }
                ],
                "DstFile": {
                    "ContentType": 2,
                    "PdfProperties": {
                        "ContentType": 1
                    }
                },
                "NumberOfCopies": 1
            }
        ],
        "Prefs": {
            "NumberOfCopies": 1,
            "AutomaticSupplementalDiscovery": true,
            "LicenseKeyString": "030qmnHcMieNjHr1vEQbUZtUi4cCg1SVpbAmnwiM3X0bjDbxapbPJYaikFjOn/lo6AhLLlfH2g8+992tRnLZfXW77sIR/TKhMvJgROcWPOaQ+rYhQHL5M9qt+GEa9rW0G0g83+HiwKOZEUKigIwFhKA+mPYZ2o/2Cd+CHctsQ77u8xRrcg86XDxMFtSsVAW/YDMUa3IPOlw8TBbUrFQFv2AyYEs2Nx4BY0IARlRqnUGOS6Y9Y7VwJgafC7Egy4eWdQ7idwaAjiTjBM7q+xzp6jRA==",
            "RenderMode": 8
        }
    },
    "action": 6
}


// Configure and Launch the Express Server
app.use(bodyParser.json({limit: '15mb'})); 
app.use(bodyParser.text({ type: 'text/plain' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public')); // load files from public directory
app.listen(process.env.PORT || 3000, function() {
  console.log('Express server listening on port %d in %s mode', this.address().port, app.settings.env);
});

// PRIMARY ENTRY POINT FOR FULL E2E PROCESS
app.get("/", function(req, res) {
  res.sendFile('public/index.html'); // no need to specify dir off root
});
app.post("/getdocs", function(req, res) {
  let receivedData = JSON.parse(req.body.payload); 
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});
async function getDocs(receivedData) {
  // 1 - CALL TDT 
  let base64data = base64encode(JSON.stringify(receivedData)); 
  tdtbody.partnerData = base64data;
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii');
  // console.log("1 - TXL = " + txl);

  // 2 - CALL RUNTIME PAYMENT CALC
  let base64payload = base64encode(txl); 
  rtbody.transactionData = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  let sessionId = rtResponse.data.session.id;
  // console.log("2 - SessionId = " + sessionId);

  // 3 - CALL SESSION TO GET FULL TXL
  sessbody.session.id = sessionId;
  let sessResponse = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let fulltxl = sessResponse.data.transactionData;
  // let fulltxldecoded = base64decode(fulltxl);
  // console.log("3 - FULL TXL = " + fulltxl);

  // 4 - CALL DCL EXECUTE JOB TICKET
  dclbody.jobTicket.DataValuesList[0].content = fulltxl;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  // console.log("4 - ENCODED PDF = " + encodedPdf);

  return('<html><object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + '"' + '></object></html>');
}





// Individual Path for TDT
app.get("/tdt", function(req, res) {
  res.sendFile('public/tdt.html' , { root : __dirname}); 
});
app.post("/tdt", function(req, res) {
  let receivedData = JSON.parse(req.body.payload); 
  tdt(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});
async function tdt(receivedData) {
  let base64data = base64encode(JSON.stringify(receivedData)); 
  tdtbody.partnerData = base64data;
  tdtbody = JSON.stringify(tdtbody);
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii'); 
  return txl;   
}

// Individual Path for Runtime
app.get("/runtime", function(req, res) {
  res.sendFile('public/runtime.html', { root : __dirname});
});
app.post("/runtime", function(req, res) {
  runtime(req.body.payload).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});
async function runtime(receivedData) {
  let encoded = base64encode(receivedData); 
  rtbody.transactionData = encoded;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  console.log(rtResponse);
  console.log("1 - Received sessionID from Runtime..." + rtResponse.data.session.id);
  return '<a href="' + rtResponse.data.url + '">runtime</a><br><a href="https://cunexus--sbatester.repl.co">back</a>'; 
}

// Individual Path for DCL
app.get("/dcl", function(req, res) {
  res.sendFile('public/dcl.html', { root : __dirname});
});
app.post("/dcl", function(req, res) {
  dcl(req.body.payload).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});
async function dcl(receivedData) {
  dclbody.jobTicket.DataValuesList[0].content = receivedData;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  // console.log("4 - ENCODED PDF = " + encodedPdf);

  return('<html><object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + '"' + '></object></html>');
}