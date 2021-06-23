/**
 *    Copyright (c) 2020, Oracle and/or its affiliates. All rights reserved.
 */

/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define([ 'N/currentRecord', 'N/search', 'N/record', 'N/url', 'N/https', 'N/ui/message'],

    function (currentRecord, search, record, url, https, message) {

        function pageInit(context){

        }

        function callSuitelet () {
            /**Function to Call Suitelet **/
            try {
                var stLogTitle = 'callSuitelet';
                log.debug(stLogTitle, stLogTitle);
                var currRec= currentRecord.get();
                var tranId = currRec.id;

                var suiteletURL= url.resolveScript({
                    scriptId: 'customscript_ns_sl_print_deposit_slip',
                    deploymentId: 'customdeploy_sl_print_deposit_slip',
                    returnExternalUrl: false,
                    params: {
                        custom_id: tranId
                    }
                });
                //var response = https.post({
                 //   url: suiteletURL,
                 //   body: {
                 //       tranId: tranId
                 //   }
               // });

                window.open(suiteletURL);

                var successMessage = message.create({
                    title: 'Success',
                    message: 'Deposit Slip is being printed',
                    type: message.Type.CONFIRMATION
                });

                successMessage.show();
                
            }
            catch (error) {
                var failMessage = message.create({
                    title: 'Error',
                    message: 'Deposit Slip was not created. Error: ' + error,
                    type: message.Type.ERROR
                });

                failMessage.show();
                log.error('Error Found', error);
            }
        }

        return {
            pageInit : pageInit,
            callSuitelet: callSuitelet
        };

    });