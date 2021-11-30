// noinspection JSUnresolvedFunction,HtmlRequiredTitleElement,DuplicatedCode

/**
 *@NApiVersion 2.x
 * @NScriptType Suitelet
 * @appliedtorecord deposit
 */
/**
 * <code>onRequest</code> event handler
 * @gov 0
 *
 * @param request
 *           {Object}
 * @param response
 *           {String}
 *
 * @return {void}
 *
 * @static
 * @function onRequest
 * @function generateXml
 */

var AVC_DS_CUSTOM_RECORD_ID = 'customrecord_avc_ds_data';
define(['N/http','N/render', 'N/record', 'N/xml', 'N/format', 'N/file', 'N/search', 'N/runtime', 'N/redirect', 'N/error', "N/log"],
  function(http, render, record, xml, format, file, search, runtime, redirect, error, log) {
      function onRequest(context) {
          try {
              var stLogTitle = "Generate Deposit PDF";
              log.debug(stLogTitle, JSON.stringify(context));


              var id = context.request.parameters.custom_id;
              if (!id) {
                  context.response.write('The parameter "custom_id" is required');
                  return;
              }
              /* Load the Deposit Record */
              var depositRecord = record.load({ type: record.Type.DEPOSIT, id: id });
              log.debug(stLogTitle, 'depositRecord: ' + JSON.stringify(depositRecord));
              var bankAcctNum = depositRecord.getValue('custbody_avc_ds_deposit_acct_num');
              var bankAcctId = depositRecord.getValue('account');

              // Load the AVC Deposit Slip Result
              var avcDsResult = getAvcDSResult(depositRecord);
              if (!avcDsResult) {
                  context.response.write('Error retrieving Deposit Slip Record for Account No ' + bankAcctNum + ' and InternalID ' + bankAcctId);
                  return;
              }
              // Load the Location Result
              var locResult = getLocResult(depositRecord);
              if (!locResult) {
                  context.response.write('Error retrieving Location Record for Account No ' + bankAcctNum + ' and InternalID ' + bankAcctId);
                  return;
              }

              // Create the Destination File-Name
              var destFilename = getDestFilename(depositRecord, avcDsResult, locResult);

              // Get the Destination Folder ID
              var destFolderId = getDestFolderId(depositRecord, avcDsResult, locResult, destFilename);

              // If a file in the Folder & same Filename Exists, DELETE IT


              // Generate the XML File to use in creating the PDF Document
              var xml = generateXml(id);
              // TEST - Write XML to File for Testing
              /*
              var xmlFile = file.create({
                  name: destFilename + '.txt',
                  fileType: file.Type.PLAINTEXT,
                  contents: xml
              })
              xmlFile.folder = destFolderId;
              var xmlFileId = xmlFile.save();
              */
              // TEST - END

              if (xml == 'Invalid Line Entry'){
                  var lineError = error.create({
                      name: 'Check_Cash_Line_Error',
                      message: 'Please make sure all deposits have a payment method of Check or Cash before printing.',
                      notifyOff: true
                  });

                  context.response.write(JSON.stringify(lineError));
              }
              else if (xml == 'No Check Number') {
                  var numberError = error.create({
                      name: 'Check_Number_Error',
                      message: 'Please make sure all checks have a Check Number before printing.',
                      notifyOff: true
                  });

                  context.response.write(JSON.stringify(numberError));
              }
              else if (xml == 'Too Many Checks'){
                  var checkError = error.create({
                      name: 'Too_Many_Checks_Error',
                      message: 'A printed deposit slip cannot have more than 18 checks',
                      notifyOff: true
                  });

                  context.response.write(JSON.stringify(checkError));
              }
              else {

                  log.debug(stLogTitle, xml);

                  var objDepositFields = search.lookupFields({
                      type: search.Type.DEPOSIT,
                      id: id,
                      columns: ['custbody_avc_ds_sub_tran_prefix', 'custbody_avc_ds_deposit_acct_num', 'trandate']
                  });

                  log.debug(stLogTitle, 'objDepositFields: ' + JSON.stringify(objDepositFields));

                  var subTranPrefix = objDepositFields.custbody_sub_tran_prefix;
                  var accountNumber = objDepositFields.custbody_deposit_acct_num;
                  var tranDate = objDepositFields.trandate;

                  var tranDateFormatted = convertDate(tranDate);

                  // fileName is NOT used anymore
                  //var fileName = subTranPrefix + '_' + tranDateFormatted + '_' + accountNumber + '_' + id + '.pdf';

                  var pdfFile = render.xmlToPdf({
                      xmlString: xml
                  });

                  // iFolderId is NOT used anymore
                  //var iFolderId = getFolderId("Deposit Slips");
                  //log.debug(stLogTitle, 'Deposit Slips Folder ID = ' + iFolderId);

                  //pdfFile.name = fileName;
                  // ADF New Setting
                  pdfFile.name = destFilename;

                  //pdfFile.folder = 420; // Was 478, but PROD is 420
                  // ADF New Setting
                  log.debug(stLogTitle, 'Deposit Slips Folder ID = ' + destFolderId);
                  pdfFile.folder = destFolderId;

                  pdfFile.isOnline = true;

                  var stPdfId = pdfFile.save();

                  var pdfFileNew = file.load({
                      id: stPdfId
                  });

                  var docUrl = runtime.getCurrentScript().getParameter({name: 'custscript_deposit_print_account_url'}) + pdfFileNew.url;

                  log.debug(stLogTitle, docUrl);

                  redirect.redirect({
                      url: docUrl
                  });
              }

              //context.response.setHeader({
              //   name: 'Deposit Slip PDF',
              //    value: 'filename=' + fileName + ''
              // });

              // context.response.renderPdf({xmlString: xml});
          }
          catch(error){
              log.debug(stLogTitle, JSON.stringify(error));
          }
      }
      function generateXml(id) {
          var stLogTitle = 'generateXml';
          var depositRecord = record.load({ type: record.Type.DEPOSIT, id: id });
          var totally = depositRecord.getValue('total');
          var accountId = depositRecord.getValue({
              fieldId: 'account'
          });
          var accountName = depositRecord.getText({
              fieldId: 'account'
          });
          accountName = escapeXml(accountName);

          // Get the Avc Deposit Slip Record
          var avcDsResult = getAvcDsResultFromAccountId(accountId);

          //var totally = format.format({value:totes, type:format.Type.CURRENCY});
          var fulldate = depositRecord.getValue('trandate');
          var tranDate = format.format({value:fulldate, type:format.Type.DATE});
          var arrChecksAndCash = getChecksAndCash(depositRecord);
          log.debug(stLogTitle, 'arrChecksAndCash: ' + JSON.stringify(arrChecksAndCash));
          var cashTotal = calculateCashTotal(arrChecksAndCash);
          var depositCount =0;
          if (cashTotal > 0){
              depositCount = 1;
          }
          //var cashTotal = format.format({value:cashTotal, type:format.Type.CURRENCY});
          var cashAndCheckTotal = calculateCashAndCheckTotal(arrChecksAndCash);
          //var cashAndCheckTotal = format.format({value:cashAndCheckTotal, type:format.Type.CURRENCY});
          var objAccountFields = getAccountFields(accountId);
          var cashBackTotal = cashAndCheckTotal - totally;
          var cashBackTotal = cashBackTotal.toFixed(2);
          var cashAndCheckTotal = cashAndCheckTotal.toFixed(2);
          var cashTotal = cashTotal.toFixed(2);
          log.debug(stLogTitle, cashBackTotal);
          var arrChecks = [];
          var notCashCheck = false;
          var noCheckNumber = false;

          // BUG HERE: I think when I'm linking in the Objects in arrChecksAndCash it is not creating Clones
          // but links. THis results in CORRECT output at the top, but wrong output in the bottom.
          // I need to fix this.
          // Combine any Checks with same ReceivedFrom & CheckNumber values
          var arrChecksAndCashUnique = new Object;
          var bCashOrCheck = false;
          for (var i=0; i<arrChecksAndCash.length; i++){
              bCashOrCheck = false;
              if (arrChecksAndCash[i].PaymentMethod == 'Check'){
                  bCashOrCheck = true;
                  var sName = arrChecksAndCash[i].ReceivedFrom;
                  var sCheck = arrChecksAndCash[i].CheckNumber;
                  var sKey = sName + '-' + sCheck;
              }
              else if (arrChecksAndCash[i].PaymentMethod == 'Cash') {
                  bCashOrCheck = true;
                  var sKey = 'Cash';
              }
              else {
                  notCashCheck = true;
                  break;
              }
              if (bCashOrCheck) {
                  if (sKey in arrChecksAndCashUnique) {
                      // sKey exists, sum the existing Amount and new Amount, leave the rest the same
                      arrChecksAndCashUnique[sKey].Amount +=
                        Number(parseFloat(arrChecksAndCash[i].Amount).toFixed(2));
                      arrChecksAndCashUnique[sKey].Memo += ', ' + arrChecksAndCash[i].Memo
                  } else {
                      // sKey does NOT exist, add the full Object to Unique object
                      // Don't do this. That will just LINK the two, and then you will clobber arrChecksAndCash[i]...
                      //   arrChecksAndCashUnique[sKey] = arrChecksAndCash[i];
                      // Spread doesn't work
                      //   arrChecksAndCashUnique[sKey] = { ...copy };
                      // Use a clone() method (below) to make a CLONE of the object.
                      arrChecksAndCashUnique[sKey] = clone(arrChecksAndCash[i]);
                      // Ensure Amount is a Float so we can Add it later
                      arrChecksAndCashUnique[sKey].Amount = Number(parseFloat(arrChecksAndCashUnique[sKey].Amount).toFixed(2));
                  }
              }
          }

          // Loop over the unique checks and add to arrChecks
          var arrSummary = [];
          // Add the Cash line-item to arrSummary array
          if ('Cash' in arrChecksAndCashUnique) {
              arrSummary.push(clone(arrChecksAndCashUnique['Cash']));
          }
          // Add all the Checks to the arrSummary array
          for (var sKey in arrChecksAndCashUnique) {
              if (arrChecksAndCashUnique[sKey].PaymentMethod == 'Check'){
                  arrChecks.push(arrChecksAndCashUnique[sKey]);
                  arrSummary.push(clone(arrChecksAndCashUnique[sKey]));
              }
          }

          // ADF: This is not needed anymore. I do this above
          /*
          for (var i=0; i<arrChecksAndCash.length; i++){
              if (arrChecksAndCash[i].PaymentMethod == 'Check'){
                  arrChecks.push(arrChecksAndCash[i]);
              }
              else if (arrChecksAndCash[i].PaymentMethod != 'Check' && arrChecksAndCash[i].PaymentMethod != 'Cash'){
                  notCashCheck = true;
                  break;
              }
          }
          */
          var checkCount = 0;

          for (var i =0; i<arrChecks.length; i++){
              checkCount += 1;
              if (valueIsEmpty(arrChecks[i].CheckNumber)){
                  noCheckNumber = true;
                  break;
              }
          }
          depositCount += checkCount;
          if (notCashCheck){
              var xml = 'Invalid Line Entry';
              return xml ;
          }
          else if (noCheckNumber){
              var xml = 'No Check Number';
              return xml;
          }
          else if (checkCount > 18){
              var xml = 'Too Many Checks';
              return xml;
          }
          else {
              log.debug(stLogTitle, JSON.stringify(arrChecks));
              var bMicrInBG = true;
              var xml = '<?xml version="1.0"?> <!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n';
              xml += '<pdf>\n';
              xml += '<head>\n';
              xml += '<style>';
              xml += '.itemlist td.label { background-color: #C2C2C2; }';
              xml += '.summary tr.label { background-color: #C2C2C2; }';
              xml += '</style>';
              xml += '<macrolist>\n';

              // BOTTOM: Bottom of Stub including Bank Acct Name, Address, Bank+4
              // NOTE: THis is applied using the MACRO LIST / <body footer = "footer"> below in the <body> tag
              xml += '<macro id="footer">\n';
              xml += '<table width="100%" align="center" style="font-size:11pt;">\n';
              xml += '<tr rowspan = "4">' + '<td align = "left" colspan = "15">' + '<b>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_name')) + '</b>' + '<br/>';
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_account_desc_1'))) {
                  xml += '<b>' + escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_desc_1')) + '</b><br/>';
              }
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_account_desc_2'))) {
                  xml += '<b>' + escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_desc_2')) + '</b><br/>';
              }
              xml += escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_address_line_1')) + '<br/>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_address_line_2'));
              xml += '</td>\n';
              xml += '<td align = "right" colspan = "15" font-size ="16" valign="bottom" style="text-align: right;">';
              //log.debug(stLogTitle + ':tranid', escapeXml(depositRecord.getValue('tranid')));
              xml += '<span style="font-size: 14px; text-align: right;">' + escapeXml(depositRecord.getValue('tranid')) + '</span><br/>';
              xml += '<span font-family="micr-font">' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_bankacct_last4')) + '</span>' + '</td>\n';
              xml += '</tr></table>\n';
              xml += '</macro>\n'

              xml += '<macro id="bg_micr">\n';
              if (bMicrInBG) {
              xml += '<p font-size = "16pt" align = "center" margin-top = "250px" margin-bottom = "0px">' + '<br/><br/>' + ' <span font-family="micr-font">' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_bankacct_micr_data')) + '</span>' + '</p>\n';
              }
              xml += '</macro>\n'

              xml += '</macrolist>\n'
              //xml += '<link name = "micr-font" type = "font" subtype = "opentype" src = "https://6198441-sb1.app.netsuite.com/core/media/media.nl?id=2915&amp;c=6198441_SB1&amp;h=e89ed1d33801a57d98a5&amp;_xt=.ttf" bytes = "2"/>\n';

              // This Works - But only if you set the File Cabinet Record for the file to "Available without Login"
              // https://debugger.na0.netsuite.com/core/media/media.nl?id=6390&c=6198441_SB1&h=4oXObzr8YOrXNYXiaXevFctyL8cW2RZsT6otS3tfluWc2oej&id=6390&_xt=.ttf&_xd=T&fcts=20211117092750
              //xml += '<link name = "micr-font" type = "font" subtype = "opentype" src = "https://6198441-sb1.app.netsuite.com/core/media/media.nl?id=6390&amp;c=6198441_SB1&amp;h=4oXObzr8YOrXNYXiaXevFctyL8cW2RZsT6otS3tfluWc2oej&amp;_xt=.ttf" bytes = "2"/>\n';
              // https://6198441.app.netsuite.com/core/media/media.nl?id=4047&amp;c=6198441&h=D1K9MZdISDQJSL21-z_oLaY_T_kFzEIXf0tWf3QJYkEYyLa-&amp;_xt=.ttf
              xml += '<link name = "micr-font" type = "font" subtype = "opentype" src = "https://6198441.app.netsuite.com/core/media/media.nl?id=4047&amp;c=6198441&amp;h=D1K9MZdISDQJSL21-z_oLaY_T_kFzEIXf0tWf3QJYkEYyLa-&amp;_xt=.ttf" bytes = "2"/>\n';

              xml += '</head>\n'
              xml += '<body footer = "footer" footer-height="20mm" size = "letter" font-size = "10" background-macro="bg_micr">\n';
              // ----- TOP STUB FOR BANK --------------
              xml += '<table width="100%" align="center" font-size = "11pt">\n';
              // -- TOP LEFT: Bank Name, Address, FracNum, Date
              xml += '<tr rowspan = "7">\n';
              xml += '<td colspan = "9" font-size = "11"><b>' + escapeXml(avcDsResult.getValue('custrecord_avc_ds_fininst_name')) + '</b>' + '<br/>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_fininst_address_1')) + '<br/>';
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_fininst_address_2'))){
                  xml += escapeXml(avcDsResult.getValue('custrecord_avc_ds_fininst_address_2')) + '<br/>';
              }
              xml += escapeXml(avcDsResult.getValue('custrecord_avc_ds_bankacct_fracnum')) + '<br/><br/>Date: ' + tranDate;
              xml += '</td>\n';

              // -- TOP: RIGHT: Cash + 18 Checks + S1, S2 in 3 Columns 7 Rows each
              xml += '<td colspan = "9">';
              xml += '<table class="itemlist" border = "1px solid #000000" border-top = "none"  font-size = "7pt">';
              xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">Cash</td>\n';
              if (cashTotal > 0) {
                  xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + cashTotal + '</span>' + '</td></tr>\n';
              } else {
                  xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:55px">' + '&nbsp;' + '</span>' + '</td></tr>\n';
              }
              // - TOP RIGHT: Left 7 Rows
              for (var i = 0; i < 6; i++) {
                  // style="background-color:#888888;"
                  xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">' + (i + 1) + '</td>\n';
                  if (!valueIsEmpty(arrChecks[i])) {
                      xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + parseFloat(arrChecks[i].Amount).toFixed(2) + '</span>' + '</td></tr>\n';
                  } else {
                      xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:55px">' + '&nbsp;' + '</span>' + '</td></tr>\n';
                  }
              }
              xml += '</table>\n';
              xml += '</td>\n';

              // - TOP: RIGHT: Middle 7 Rows
              xml += '<td colspan = "9"><table class="itemlist" border = "1px solid #000000" border-top = "none"  font-size = "7pt">\n';
              for (var i = 6; i < 13; i++) {
                  xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">' + (i + 1) + '</td>\n';
                  if (!valueIsEmpty(arrChecks[i])) {
                      xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + parseFloat(arrChecks[i].Amount).toFixed(2) + '</span>' + '</td></tr>\n';
                  } else {
                      xml += '<td align = "right" colspan = "10"><span style="padding-left:55px">&nbsp;</span></td></tr>\n';
                  }
              }
              xml += '</table>\n';
              xml += '</td>\n';

              // - TOP: RIGHT: Right 7 Rows
              xml += '<td colspan = "9"><table class="itemlist" border = "1px solid #000000" border-top = "none" font-size = "7pt">\n';
              for (var i = 13; i < 18; i++) {
                  xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">' + (i + 1) + '</td>\n';
                  if (!valueIsEmpty(arrChecks[i])) {
                      xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + parseFloat(arrChecks[i].Amount).toFixed(2) + '</span>' + '</td></tr>\n';
                  } else {
                      xml += '<td align = "right" colspan = "10"><span style="padding-left:55px">&nbsp;</span></td></tr>\n';
                  }
              }
              xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">' + 'S1' + '</td>\n';
              xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + parseFloat(cashAndCheckTotal).toFixed(2) + '</span>' + '</td></tr>\n';

              xml += '<tr style="border-top: 1px solid #000000;"><td class="label" colspan = "1">' + 'S2' + '</td>\n';
              xml += '<td align = "right" colspan = "10">' + '<span style="padding-left:40px">' + parseFloat(cashBackTotal).toFixed(2) + '</span>' + '</td></tr>\n';

              xml += '</table>\n';
              xml += '</td>\n';
              xml += '</tr>\n';
              xml += '</table>\n';

              // - TOP: BOTTOM: Bank Account Info, Address, # of Deposits, Total of Deposit
              xml += '<table width="100%" align="center" style="font-size:11pt;">\n';
              xml += '<tr rowspan = "4">' + '<td align = "left" colspan = "15">' + '<b>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_name')) + '</b>' + '<br/>';
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_account_desc_1'))) {
                  xml += '<b>' + escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_desc_1')) + '</b><br/>';
              } else {
                  // Add Blank Line
                  xml += '<br/>'
              }
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_account_desc_2'))) {
                  xml += '<b>' + escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_desc_2')) + '</b><br/>';
              } else {
                  // Add Blank Line
                  xml += '<br/>'
              }
              xml +=  escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_address_line_1')) + '<br/>';
              if (!valueIsEmpty(avcDsResult.getValue('custrecord_avc_ds_account_address_line_2'))) {
                  escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_address_line_2')); + '<br/>';
              } else {
                  // Add Blank Line
                  xml += '<br/>'
              }

              xml +=  '</td>\n';
              xml += '<td align = "center" colspan = "9">' + '<br/>Number of Deposits: ' + depositCount + '</td>\n';
              xml += '<td align = "right" colspan = "9">' + '<br/>Total Deposit: ' + totally.toFixed(2) + '</td>\n';
              xml += '</tr></table>\n';

              // TOP: MICR DATA LINE
              if (!bMicrInBG) {
                  xml += '<p font-size = "16pt" align = "center" margin-top = "0px" margin-bottom = "0px">' + '<br/><br/>' + ' <span font-family="micr-font">' +
                    escapeXml(avcDsResult.getValue('custrecord_avc_ds_bankacct_micr_data')) + '</span>' + '</p>\n';
                  var bottomMarginTop = "50px";
              } else {
                  var bottomMarginTop = "80px";
              }

              // MID: TOP: Bank Account Name, Date, Deposit Summary Header
              xml += '<table margin-top = "' + bottomMarginTop + '" width="100%" align="center">\n';
              xml += '<tr rowspan = "2">' + '<td align = "left" font-size = "10" colspan = "15">' + '<b>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_fininst_name')) + '</b>' + '</td>\n';
              xml += '<td align = "right" colspan = "15" font-size = "7">' + tranDate + '</td>\n';
              xml += '</tr></table>\n';

              xml += '<p align = "center" font-size = "15" margin-top = "0px" margin-bottom = "0px"><b>Deposit Summary</b></p>';

              xml += '<p align = "center" font-size = "12" margin-top = "3px" margin-bottom = "0px">' + '<b>' +
                escapeXml(avcDsResult.getValue('custrecord_avc_ds_account_desc_1')) + '</b>' + '</p>\n';

              xml += '<p align = "center" font-size = "8" margin-top = "5px">' + 'Summary of Deposits to ' + accountName + ' on ' + tranDate + '</p>\n';

              // MID: Middle: Table with list of Checks/Cash Detail: Check No, Pmt Method, Rcvd From, Memo, Amount
              //xml += '<table width="100%" align="center" cellpadding="0" cellspacing="0" style="text-align:left; border:1px solid #000000; border-right: none; font-size: 7pt">\n';
              xml += '<table class="summary" width="100%" align="center" cellspacing="0" style="text-align:left; border:1px solid #000000; border-right: none; font-size: 7pt">\n';
              xml += '<thead>\n';
              xml += '<tr class="label" >\n';
              xml += '<th align = "center" style="border-right:1px solid #000000; width: 12%;">Chk No.</th>\n';
              xml += '<th align = "center" style="border-right:1px solid #000000; width = 12%">PmtMethod</th>\n';
              xml += '<th align = "center" style="border-right:1px solid #000000; width: 180px;">Rcd From</th>\n';
              xml += '<th align = "center" style="border-right:1px solid #000000;">Memo</th>\n';
              xml += '<th align = "center" style="border-right:1px solid #000000; width: 15%;">Amount</th>\n';
              xml += '</tr>\n';
              xml += '</thead>\n';
              xml += '<tbody>\n';
              var arrSum = arrSummary;
              for (var i = 0; i < arrSum.length; i++) {

                  xml += '<tr rowspan = "1">\n';
                  xml += '<td  height = "1px" align = "left" style="border-right:1px solid #000000;">' + arrSum[i].CheckNumber + '</td>\n';
                  xml += '<td  height = "1px" align = "left" style="border-right:1px solid #000000; width: 10%">' + arrSum[i].PaymentMethod + '</td>\n';
                  xml += '<td  height = "1px" align = "left" style="border-right:1px solid #000000;">' + arrSum[i].ReceivedFrom + '</td>\n';
                  xml += '<td  height = "1px" align = "left" style="border-right:1px solid #000000;">' + truncateString(arrSum[i].Memo, 170) + '</td>\n';
                  xml += '<td  height = "1px" align = "right" style="border-right:1px solid #000000;">' + parseFloat(arrSum[i].Amount).toFixed(2) + '</td>\n';
                  xml += '</tr>\n';

              }

              xml += '<tr rowspan = "6">\n';
              xml += '<td style="border-right:1px solid #000000;">&nbsp;</td>\n';
              xml += '<td style="border-right:1px solid #000000;">&nbsp;</td>\n';
              xml += '<td style="border-right:1px solid #000000;">&nbsp;</td>\n';
              xml += '<td align = "left" style="border-right:1px solid #000000;">' + '<br/><br/><br/>' + 'Deposit Subtotal:<br/><br/>' + 'Less Cash Back:<br/><br/>' + '<b>Deposit Total:</b>' + '</td>\n';
              xml += '<td align = "right" style="border-right:1px solid #000000;">' + '<br/><br/><br/>' + cashAndCheckTotal + '<br/><br/>' + cashBackTotal + '<br/><br/>' + '<b>' + totally.toFixed(2) + '</b>' + '</td>\n';
              xml += '</tr>\n';


              xml += '</tbody>\n';
              xml += '</table>\n';
              xml += '</body>\n</pdf>';
              return xml;
          }
      }

      function getChecksAndCash(recDeposit){
          var stLogTitle = 'getChecksAndCash';
          log.debug(stLogTitle, '--Entry--');
          var arrReturn = [];
          var paymentsLineCount = recDeposit.getLineCount({
              sublistId: 'payment'
          });
          var otherDepositLineCount = recDeposit.getLineCount({
              sublistId: 'other'
          });

          for (var i=0; i<paymentsLineCount; i++){
              var checkNumber = recDeposit.getSublistValue({
                  sublistId: 'payment',
                  fieldId: 'docnumber',
                  line: i
              });

              var pmtMethod = recDeposit.getSublistText({
                  sublistId: 'payment',
                  fieldId: 'paymentmethod',
                  line: i
              });

              var receivedFrom = recDeposit.getSublistText({
                  sublistId: 'payment',
                  fieldId: 'entity',
                  line: i
              });

              var depositMemo = recDeposit.getSublistValue({
                  sublistId: 'payment',
                  fieldId: 'memo',
                  line: i
              });

              var lineAmount = recDeposit.getSublistValue({
                  sublistId: 'payment',
                  fieldId: 'paymentamount',
                  line: i
              });

              lineAmount = parseFloat(lineAmount).toFixed(2);

              var objPayments = {
                  CheckNumber : checkNumber,
                  PaymentMethod: pmtMethod,
                  ReceivedFrom: receivedFrom,
                  Memo: depositMemo,
                  Amount: lineAmount
              };

              arrReturn.push(objPayments);
          }

          for (var j=0; j<otherDepositLineCount; j++){
              var checkNumber = recDeposit.getSublistValue({
                  sublistId: 'other',
                  fieldId: 'refnum',
                  line: j
              });

              var pmtMethod = recDeposit.getSublistText({
                  sublistId: 'other',
                  fieldId: 'paymentmethod',
                  line: j
              });

              var receivedFrom = recDeposit.getSublistText({
                  sublistId: 'other',
                  fieldId: 'entity',
                  line: j
              });

              var depositMemo = recDeposit.getSublistValue({
                  sublistId: 'other',
                  fieldId: 'memo',
                  line: j
              });

              var lineAmount = recDeposit.getSublistValue({
                  sublistId: 'other',
                  fieldId: 'amount',
                  line: j
              });

              lineAmount = parseFloat(lineAmount).toFixed(2);

              var objPayments = {
                  CheckNumber : checkNumber,
                  PaymentMethod: pmtMethod,
                  ReceivedFrom: receivedFrom,
                  Memo: depositMemo,
                  Amount: lineAmount
              };

              arrReturn.push(objPayments);
          }
          log.debug(stLogTitle, '--Exit--');

          return arrReturn;

      }

      function calculateCashTotal(arrChecksAndCash){
          var stLogTitle = 'calculateCashTotal';
          log.debug(stLogTitle, '--Entry--');
          var cashTotal = 0;

          for (var i =0; i<arrChecksAndCash.length; i++){
              if (arrChecksAndCash[i].PaymentMethod == 'Cash'){
                  cashTotal += parseFloat(arrChecksAndCash[i].Amount);
              }
          }

          log.debug(stLogTitle, 'cashTotal: ' + cashTotal);

          log.debug(stLogTitle, '--Exit--');

          return cashTotal;

      }

      function calculateCashAndCheckTotal(arrChecksAndCash){
          var stLogTitle = 'calculateCashAndCheckTotal';
          log.debug(stLogTitle, '--Entry--');
          var checksAndCashTotal = 0;

          for (var i=0; i<arrChecksAndCash.length; i++){
              checksAndCashTotal += parseFloat(arrChecksAndCash[i].Amount);
          }

          log.debug(stLogTitle, 'checksAndCashTotal: ' + checksAndCashTotal);

          log.debug(stLogTitle,'--Exit--');

          return checksAndCashTotal;

      }

      function valueIsEmpty(stValue)
      {
          return ((stValue === '' || stValue == null || stValue == undefined)
            || (stValue.constructor === Array && stValue.length == 0)
            || (stValue.constructor === Object && (function(v){for(var k in v)return false;return true;})(stValue)));
      };


      function getAccountFields(accountId){
          var objAccountFields = search.lookupFields({
              type: search.Type.ACCOUNT,
              id: accountId,
              columns: ['custrecord_avc_ds_account_fin_inst_name',
                  'custrecord_avc_ds_bank_fractional_num',
                  'custrecord_avc_ds_bank_account_name',
                  'custrecord_avc_ds_bank_descriptive_line' ,
                  'custrecord_avc_ds_bank_address_line_1' ,
                  'custrecord_avc_ds_bank_address_line_2',
                  'custrecord_avc_ds_account_micr_data',
                  'custrecord_avc_ds_bank_account_number_4',
                  'custrecord_avc_ds_account_descr_line_2',
                  'custrecord_avc_ds_fin_inst_address_1',
                  'custrecord_avc_ds_fin_inst_address_2']
          });

          Object.keys(objAccountFields).forEach(function(stField){
              objAccountFields[stField] = escapeXml(objAccountFields[stField]);
          });

          return objAccountFields;
      }

      function convertDate(usDate) {
          var dateParts = usDate.split(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          return dateParts[3] + "-" + dateParts[1] + "-" + dateParts[2];
      }

      function escapeXml(unsafe) {
          if (unsafe == null) { return ''; }
          return unsafe.replace(/[<>&'"]/g, function (c) {
              switch (c) {
                  case '<': return '&lt;';
                  case '>': return '&gt;';
                  case '&': return '&amp;';
                  case '\'': return '&apos;';
                  case '"': return '&quot;';
              }
          });
      }

      /*
       * ADFMOD - BEGIN ADDED CODE
       */
      function dateToYMD(usDate, sDelim) {
          sDelim = typeof sDelim !== 'undefined' ? sDelim : '-';
          var fmtDate = new Date(usDate.getTime() - (usDate.getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];
          return fmtDate.split('-').join(sDelim);
      }

      /*
       * @param {search} objSearch
       */
      function getFolderId_DoesNotWork(sFolderName) {
          var stLogTitle = "getFolderId";
          log.debug(stLogTitle, 'sFolderName = ' + sFolderName);
          /* This works, but I am NOT checking to ensure the Folder is at the ROOT of the File Cabinet */
          /* @type search */
          var mySearch = search.create({
              type : search.Type.FOLDER,
              columns: ['internalid','parent'],
              filters: [
                  ['name', search.Operator.IS, sFolderName],
                  'and',
                  ['parent', search.Operator.EQUALTO, null]
              ]
          });
          log.debug(stLogTitle, 'Run Search = ');

          var searchResult = mySearch.run().getRange({start: 0, end: 1});
          log.debug(stLogTitle, 'searchResult = ' + JSON.stringify(searchResult));

          var folderId = 0;
          if (searchResult != null) {
              folderId = searchResult[0].getValue('internalid');
          }
          return folderId;
      }

      /*
       * We want to create a filename that looks like this:
       *  <LocExternalId>-<Acct#-4>-<YYYYMMDD>-<Deposit#>.pdf
       */

      function getDestFilename(objDeposit, objAvcDs, objLoc) {
          var stLogTitle = 'getDestFilename';
          var sFilename = '';
          // <LocExtId>
          sFilename += objLoc.getValue('tranprefix');

          // <LocExtId>-<Acct#-4>
          sFilename += '-' + objAvcDs.getValue('custrecord_avc_ds_bankacct_last4');

          // <LocExtId>-<Acct#-4>-<YYYYMMDD>
          var tranDate = objDeposit.getValue('trandate');
          sFilename += '-' + dateToYMD(tranDate, '');

          // <LocExtId>-<Acct#-4>-<YYYYMMDD>-<Deposit#>
          sFilename += '-' + objDeposit.getValue('tranid');

          // <LocExtId>-<Acct#-4>-<YYYYMMDD>-<Deposit#>.pdf
          sFilename += '.pdf';

          log.debug(stLogTitle, 'sFilename = ' + sFilename);
          return sFilename;
      }

      /*
       * We want to have a folder structure like the following:
       * File Cabinet\Deposit Slips\<YYYY>\<LocExternalID>
       * File Name: <LocExternalID>-<Acct#-4>-<YYYYMMDD>-Deposit#
       */
      function getDestFolderId(objDeposit, objAvcDs, objLoc, destFilename) {
          var stLogTitle = 'getDestFolderId';
          // Root\
          var sFolderPath = "Deposit Slips";

          // Root\YYYY
          var tranDate = objDeposit.getValue('trandate');
          log.debug(stLogTitle, 'tranDate = ' + tranDate);
          var dateStrY = dateToYMD(tranDate, '').substr(0,4);
          log.debug(stLogTitle, 'dateStrY = ' + dateStrY);
          sFolderPath += '\\' + dateStrY;

          // Root\YYYY\LocExtID
          sFolderPath += '\\' + objLoc.getValue('tranprefix');
          log.debug(stLogTitle, 'sFolderPath = ' + sFolderPath);

          // Now get the FolderID
          var destFolderId = getFolderIdFromPath(sFolderPath);
          log.debug(stLogTitle, 'destFolderId = ' + destFolderId);

          // Delete any Files in this Folder that match destFilename
          // This isn't necessary. Turns out when I just have to CTRL-R to refresh the PDF file to re-display the New one
          //deleteFile(sFolderPath, destFilename);

          return destFolderId;
      }

      function deleteFile(folderName, fileName){
          try {
              var fileObj = file.load({
                  id: folderName + '/' + fileName
              });
              if (fileObj) {
                  file.delete({
                      id: file.id
                  });
              }
          }
          catch (error) {}
      }

      /*
       * Given a folder path like: \Name1\Name2\Name3 gets the FolderId of Name3
       * NOTE: If any of the folders do NOT exist, it will CREATE them.
       */
      function getFolderIdFromPath(sFolderPath) {
          var stLogTitle = 'getFolderIdFromPath'
          log.debug(stLogTitle, 'sFolderPath = ' + sFolderPath);
          var fldrs = sFolderPath.split("\\");
          var sParent = '';
          for (var i = 0; i < fldrs.length; i++) {
              var currFolderName = fldrs[i];
              var currFolderId = getFolderId(currFolderName, sParent);
              if (!currFolderId) {
                  // Didn't find that folder, add it
                  log.debug(stLogTitle, 'DID NOT FIND = ' + currFolderName);
                  currFolderId = createFolder(currFolderName, sParent);
                  sParent = currFolderId;
              } else {
                  // Found folder, set that as the new Parent and move to next one.
                  log.debug(stLogTitle, 'Found = ' + currFolderName);
                  sParent = currFolderId;
              }
          }
          return currFolderId;
      }

      /*
      * Creates the folder named sFolderName in the sParent location
      * Returns: folderId of the newly created folder
       */
      function createFolder(sFolderName, sParent) {
          log.debug('createFolder', 'sFolderName = ' + sFolderName + ', sParent = ' + sParent);
          var folder = record.create({
              type: record.Type.FOLDER
          });
          folder.setValue({fieldId: 'name', value: sFolderName});
          folder.setValue({fieldId: 'parent', value: sParent});
          var folderId = folder.save();
          return folderId;
      }

      /*
       * Given a Folder Name, finds the folder with the given parent.
       * If no parent is specified, only finds folders at the Root level (those where parent = '')
       */
      function getFolderId(sFolderName, sParent) {
          sParent = typeof sParent !== 'undefined' ? sParent : '';
          var stLogTitle = "getFolderId";
          log.debug(stLogTitle, 'sFolderName = ' + sFolderName);
          /* This works, but I am NOT checking to ensure the Folder is at the ROOT of the File Cabinet */
          /* @type search */
          var mySearch = search.create({
              type : search.Type.FOLDER,
              columns: ['internalid','parent'],
              filters: [
                  ['name', search.Operator.IS, sFolderName],
              ]
          });
          log.debug(stLogTitle, 'Run Search = ');

          var searchResults = mySearch.run().getRange({start: 0, end: 100});
          for (var i = 0; i < searchResults.length; i++) {
              var result = searchResults[i];
              log.debug(stLogTitle, 'result = ' + JSON.stringify(result));

              var resParent = result.getValue('parent');
              log.debug(stLogTitle, 'resParent = ' + JSON.stringify(resParent));
              if (resParent == sParent) {
                  var folderId = result.getValue('internalid');
                  return folderId;
              }
          }
          return false;
      }

      function getAvcDsResultFromAccountId(accountId) {
          var stLogTitle = 'getAvcDsResultFromAccountId';
          var dsSearch = search.create({
              type : AVC_DS_CUSTOM_RECORD_ID,
              columns: [
                  'custrecord_avc_ds_account_name',
                  'custrecord_avc_ds_fininst',
                  'custrecord_avc_ds_fininst_name',
                  'custrecord_avc_ds_fininst_address_1',
                  'custrecord_avc_ds_fininst_address_2',
                  'custrecord_avc_ds_account_address_line_1',
                  'custrecord_avc_ds_account_address_line_2',
                  'custrecord_avc_ds_account_desc_1',
                  'custrecord_avc_ds_account_desc_2',
                  'custrecord_avc_ds_bankacct_fracnum',
                  'custrecord_avc_ds_bankacct_last4',
                  'custrecord_avc_ds_bankacct_micr_data'
              ],
              filters: [
                  ['custrecord_avc_ds_account', search.Operator.IS, accountId]
              ]
          });
          var searchResults = dsSearch.run().getRange({start: 0, end: 1});
          log.debug(stLogTitle, 'searchResults = ' + JSON.stringify(searchResults));
          if (searchResults.length == 1) {
              var objAvcDsFields = searchResults[0];
              log.debug(stLogTitle, 'ObjAvcDsFields = ' + JSON.stringify(objAvcDsFields));
              return objAvcDsFields;
          }
          return false;
      }
      /*
       * Gets the Custom Record Fields that contains all the Deposit Slip Data for creating the Deposit Slip
       * This record has a "link" to the Account record, which is how we find it.
       */
      function getAvcDSResult(depositRecord) {
          var stLogTitle = 'getAvcDSResult';
          var accountId = depositRecord.getValue({
              fieldId: 'account'
          });
          return getAvcDsResultFromAccountId(accountId);
      }

      function getLocResult(depositRecord) {
          var stLogTitle = 'getLocResult';
          var locId = depositRecord.getValue('location');
          log.debug(stLogTitle + ':locId', locId);
          if (!locId) {
              log.debug(stLogTitle + '', 'Warning: No Location Found!');
              return false;
          }
          var dsSearch = search.create({
              type : search.Type.LOCATION,
              columns: [
                  'name',
                  'tranprefix'
              ],
              filters: [
                  ['internalid', search.Operator.IS, locId]
              ]
          });
          var searchResults = dsSearch.run().getRange({start: 0, end: 1});
          log.debug(stLogTitle, 'searchResults = ' + JSON.stringify(searchResults));
          if (searchResults.length == 1) {
              var objLocFields = searchResults[0];
              log.debug(stLogTitle, 'objLocFields = ' + JSON.stringify(objLocFields));
              return objLocFields;
          }
          return false;
      }

      function clone(obj) {
          var copy;

          // Handle the 3 simple types, and null or undefined
          if (null == obj || "object" != typeof obj) return obj;

          // Handle Date
          if (obj instanceof Date) {
              copy = new Date();
              copy.setTime(obj.getTime());
              return copy;
          }

          // Handle Array
          if (obj instanceof Array) {
              copy = [];
              for (var i = 0, len = obj.length; i < len; i++) {
                  copy[i] = clone(obj[i]);
              }
              return copy;
          }

          // Handle Object
          if (obj instanceof Object) {
              copy = {};
              for (var attr in obj) {
                  if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
              }
              return copy;
          }

          throw new Error("Unable to copy obj! Its type isn't supported.");
      }

      function truncateString(string, limit) {
          if (string.length > limit) {
              return string.substring(0, limit) + "..."
          } else {
              return string
          }
      }

      /*
       * ADFMOD - END ADDED CODE
       */
      return {
          onRequest: onRequest
      }
  });